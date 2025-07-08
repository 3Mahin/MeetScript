const extend = function() { //helper function to merge objects
  let target = arguments[0],
      sources = [].slice.call(arguments, 1);
  for (let i = 0; i < sources.length; ++i) {
    let src = sources[i];
    for (key in src) {
      let val = src[key];
      target[key] = typeof val === "object"
        ? extend(typeof target[key] === "object" ? target[key] : {}, val)
        : val;
    }
  }
  return target;
};

const WORKER_FILE = {
  wav: "WavWorker.js",
  mp3: "Mp3Worker.js"
};

// default configs
const CONFIGS = {
  workerDir: "/workers/",     // worker scripts dir (end with /)
  numChannels: 2,     // number of channels
  encoding: "wav",    // encoding (can be changed at runtime)

  // runtime options
  options: {
    timeLimit: 1200,           // recording time limit (sec)
    encodeAfterRecord: true, // process encoding after recording
    progressInterval: 1000,   // encoding progress report interval (millisec)
    bufferSize: undefined,    // buffer size (use browser default)

    // encoding-specific options
    wav: {
      mimeType: "audio/wav"
    },
    mp3: {
      mimeType: "audio/mpeg",
      bitRate: 192            // (CBR only): bit rate = [64 .. 320]
    }
  }
};

class Recorder {

  constructor(source, configs) { //creates audio context from the source and connects it to the worker
    extend(this, CONFIGS, configs || {});
    this.context = source.context;
    if (this.context.createScriptProcessor == null)
      this.context.createScriptProcessor = this.context.createJavaScriptNode;
    this.input = this.context.createGain();
    source.connect(this.input);
    this.buffer = [];
    this.initWorker();
  }

  isRecording() {
    return this.processor != null;
  }

  setEncoding(encoding) {
    if(!this.isRecording() && this.encoding !== encoding) {
        this.encoding = encoding;
        this.initWorker();
    }
  }

  setOptions(options) {
    if (!this.isRecording()) {
      extend(this.options, options);
      this.worker.postMessage({ command: "options", options: this.options});
    }
  }

  startRecording() {
    if(!this.isRecording()) {
      let numChannels = this.numChannels;
      let buffer = this.buffer;
      let worker = this.worker;
      this.processor = this.context.createScriptProcessor(
        this.options.bufferSize,
        this.numChannels, this.numChannels);
      this.input.connect(this.processor);
      // Connect to destination for recording (no mute needed since we handle it at mixing level)
      this.processor.connect(this.context.destination);
      this.processor.onaudioprocess = function(event) {
        for (var ch = 0; ch < numChannels; ++ch)
          buffer[ch] = event.inputBuffer.getChannelData(ch);
        worker.postMessage({ command: "record", buffer: buffer });
      };
      this.worker.postMessage({
        command: "start",
        bufferSize: this.processor.bufferSize
      });
      this.startTime = Date.now();
    }
  }

  cancelRecording() {
    if(this.isRecording()) {
      this.input.disconnect();
      this.processor.disconnect();
      delete this.processor;
      this.worker.postMessage({ command: "cancel" });
    }
  }

  finishRecording() {
    if (this.isRecording()) {
      this.input.disconnect();
      this.processor.disconnect();
      delete this.processor;
      this.worker.postMessage({ command: "finish" });
    }
  }

  cancelEncoding() {
    if (this.options.encodeAfterRecord)
      if (!this.isRecording()) {
        this.onEncodingCanceled(this);
        this.initWorker();
      }
  }

  initWorker() {
    if (this.worker != null)
      this.worker.terminate();
    this.onEncoderLoading(this, this.encoding);
    this.worker = new Worker(this.workerDir + WORKER_FILE[this.encoding]);
    let _this = this;
    this.worker.onmessage = function(event) {
      let data = event.data;
      switch (data.command) {
        case "loaded":
          _this.onEncoderLoaded(_this, _this.encoding);
          break;
        case "timeout":
          _this.onTimeout(_this);
          break;
        case "progress":
          _this.onEncodingProgress(_this, data.progress);
          break;
        case "complete":
          _this.onComplete(_this, data.blob);
      }
    }
    this.worker.postMessage({
      command: "init",
      config: {
        sampleRate: this.context.sampleRate,
        numChannels: this.numChannels
      },
      options: this.options
    });
  }

  onEncoderLoading(recorder, encoding) {}
  onEncoderLoaded(recorder, encoding) {}
  onTimeout(recorder) {}
  onEncodingProgress(recorder, progress) {}
  onEncodingCanceled(recorder) {}
  onComplete(recorder, blob) {}

}

const audioCapture = (timeLimit, muteTab, format, quality, limitRemoved) => {
  // First capture tab audio
  chrome.tabCapture.capture({audio: true}, (tabStream) => {
    if (!tabStream) {
      console.error('Failed to capture tab audio');
      return;
    }
    
    console.log('Background: Tab audio captured successfully');
    
    // Then capture microphone audio
    navigator.mediaDevices.getUserMedia({audio: true})
      .then((micStream) => {
        console.log('Background: Microphone audio captured successfully');
        console.log('Background: Tab tracks:', tabStream.getAudioTracks().length);
        console.log('Background: Mic tracks:', micStream.getAudioTracks().length);
        
        let startTabId; //tab when the capture is started
        let timeout;
        let completeTabID; //tab when the capture is stopped
        let audioURL = null; //resulting object when encoding is completed
        let audioBlob = null; //store the blob for transcription
        chrome.tabs.query({active:true, currentWindow: true}, (tabs) => startTabId = tabs[0].id) //saves start tab
        
        const audioCtx = new AudioContext();
        
        // Create sources for both streams
        const tabSource = audioCtx.createMediaStreamSource(tabStream);
        const micSource = audioCtx.createMediaStreamSource(micStream);
        
        // Create a mixer to combine both audio streams
        const mixer = audioCtx.createGain();
        const tabGain = audioCtx.createGain();
        const micGain = audioCtx.createGain();
        
        // Set gain levels (adjust these for balance between tab and mic audio)
        tabGain.gain.value = 0.7; // Tab audio at 70%
        micGain.gain.value = 0.8; // Microphone audio at 80% (increased for better pickup)
        
        console.log('Background: Audio mixing setup - Tab gain:', tabGain.gain.value, 'Mic gain:', micGain.gain.value);
        
        // Connect the audio graph
        tabSource.connect(tabGain);
        micSource.connect(micGain);
        tabGain.connect(mixer);
        micGain.connect(mixer);
        
        // Create a MediaStreamDestination to capture the mixed audio
        const destination = audioCtx.createMediaStreamDestination();
        mixer.connect(destination);
        
        // Connect tab audio directly to speakers for monitoring (without microphone)
        const tabMonitorGain = audioCtx.createGain();
        tabMonitorGain.gain.value = 0.5; // Lower volume for monitoring
        tabSource.connect(tabMonitorGain);
        tabMonitorGain.connect(audioCtx.destination);
        
        console.log('Background: Audio mixing complete, destination tracks:', destination.stream.getAudioTracks().length);
        
        // Create a MediaStreamSource from the mixed stream for the Recorder
        const mixedSource = audioCtx.createMediaStreamSource(destination.stream);
        
        // Test microphone audio levels
        const micAnalyser = audioCtx.createAnalyser();
        micSource.connect(micAnalyser);
        const micData = new Uint8Array(micAnalyser.frequencyBinCount);
        
        // Check microphone levels every second
        const checkMicLevels = () => {
          micAnalyser.getByteFrequencyData(micData);
          const micLevel = micData.reduce((a, b) => a + b) / micData.length;
          console.log('Background: Microphone audio level:', micLevel);
          if (micLevel > 0) {
            console.log('Background: Microphone is picking up audio!');
          }
        };
        
        // Check levels every second for first 5 seconds
        let checkCount = 0;
        const micCheckInterval = setInterval(() => {
          checkMicLevels();
          checkCount++;
          if (checkCount >= 5) {
            clearInterval(micCheckInterval);
          }
        }, 1000);
        
        let mediaRecorder = new Recorder(mixedSource); //initiates the recorder based on the mixed stream
        mediaRecorder.setEncoding(format); //sets encoding based on options
        if(limitRemoved) { //removes time limit
          mediaRecorder.setOptions({timeLimit: 10800});
        } else {
          mediaRecorder.setOptions({timeLimit: timeLimit/1000});
        }
        if(format === "mp3") {
          mediaRecorder.setOptions({mp3: {bitRate: quality}});
        }
        
        // Add error handling for the recorder
        mediaRecorder.onError = (error) => {
          console.error('Background: Recorder error:', error);
          // Fallback to separate recording method
          console.log('Background: Trying fallback recording method...');
          startFallbackRecording(tabStream, micStream, format, quality, limitRemoved, timeLimit, muteTab);
        };
        
        mediaRecorder.startRecording();

        function onStopCommand(command) { //keypress
          if (command === "stop") {
            stopCapture();
          }
        }
        function onStopClick(request) { //click on popup
          if(request === "stopCapture") {
            stopCapture();
          } else if (request === "cancelCapture") {
            cancelCapture();
          } else if (request.cancelEncodeID) {
            if(request.cancelEncodeID === startTabId && mediaRecorder) {
              mediaRecorder.cancelEncoding();
            }
          }
        }
        chrome.commands.onCommand.addListener(onStopCommand);
        chrome.runtime.onMessage.addListener(onStopClick);
        let contentScriptReady = false;
        
        mediaRecorder.onComplete = (recorder, blob) => {
          audioURL = window.URL.createObjectURL(blob);
          audioBlob = blob; // Store the blob locally
          globalAudioBlob = blob; // Store the blob globally for transcription
          globalAudioURL = audioURL; // Store the URL globally
          if(completeTabID) {
            console.log('Background: Sending encodingComplete with blob size:', blob.size);
            // Send immediately if content script is ready, otherwise wait
            if (contentScriptReady) {
              chrome.tabs.sendMessage(completeTabID, {type: "encodingComplete", audioURL, hasAudioBlob: true});
            } else {
              setTimeout(() => {
                chrome.tabs.sendMessage(completeTabID, {type: "encodingComplete", audioURL, hasAudioBlob: true});
              }, 1000);
            }
          }
          mediaRecorder = null;
        }
        mediaRecorder.onEncodingProgress = (recorder, progress) => {
          if(completeTabID) {
            chrome.tabs.sendMessage(completeTabID, {type: "encodingProgress", progress: progress});
          }
        }

        const stopCapture = function() {
          let endTabId;
          //check to make sure the current tab is the tab being captured
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            endTabId = tabs[0].id;
            if(mediaRecorder && startTabId === endTabId){
              mediaRecorder.finishRecording();
              chrome.tabs.create({url: "complete.html"}, (tab) => {
                completeTabID = tab.id;
                let completeCallback = () => {
                  // Check if encoding is already complete
                  const hasAudioBlob = audioBlob !== null;
                  console.log('Background: Sending createTab with hasAudioBlob:', hasAudioBlob);
                  chrome.tabs.sendMessage(tab.id, {type: "createTab", format: format, audioURL, hasAudioBlob: hasAudioBlob, startID: startTabId});
                }
                setTimeout(completeCallback, 500);
              });
              closeStream(endTabId);
            }
          })
        }

        const cancelCapture = function() {
          let endTabId;
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            endTabId = tabs[0].id;
            if(mediaRecorder && startTabId === endTabId){
              mediaRecorder.cancelRecording();
              closeStream(endTabId);
            }
          })
        }

//removes the audio context and closes recorder to save memory
        const closeStream = function(endTabId) {
          chrome.commands.onCommand.removeListener(onStopCommand);
          chrome.runtime.onMessage.removeListener(onStopClick);
          mediaRecorder.onTimeout = () => {};
          audioCtx.close();
          tabStream.getAudioTracks()[0].stop();
          micStream.getAudioTracks()[0].stop();
          sessionStorage.removeItem(endTabId);
          chrome.runtime.sendMessage({captureStopped: endTabId});
        }

        mediaRecorder.onTimeout = stopCapture;

        // Disabled audio feedback to prevent hearing own voice during recording
        // if(!muteTab) {
        //   let audio = new Audio();
        //   audio.srcObject = tabStream;
        //   audio.play();
        // }
      })
      .catch((error) => {
        console.error('Failed to capture microphone audio:', error);
        // Fallback to tab-only recording if microphone fails
        console.log('Background: Falling back to tab-only recording');
        
        let startTabId;
        let timeout;
        let completeTabID;
        let audioURL = null;
        let audioBlob = null;
        chrome.tabs.query({active:true, currentWindow: true}, (tabs) => startTabId = tabs[0].id);
        
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(tabStream);
        let mediaRecorder = new Recorder(source);
        
        mediaRecorder.setEncoding(format);
        if(limitRemoved) {
          mediaRecorder.setOptions({timeLimit: 10800});
        } else {
          mediaRecorder.setOptions({timeLimit: timeLimit/1000});
        }
        if(format === "mp3") {
          mediaRecorder.setOptions({mp3: {bitRate: quality}});
        }
        mediaRecorder.startRecording();

        function onStopCommand(command) {
          if (command === "stop") {
            stopCapture();
          }
        }
        function onStopClick(request) {
          if(request === "stopCapture") {
            stopCapture();
          } else if (request === "cancelCapture") {
            cancelCapture();
          } else if (request.cancelEncodeID) {
            if(request.cancelEncodeID === startTabId && mediaRecorder) {
              mediaRecorder.cancelEncoding();
            }
          }
        }
        chrome.commands.onCommand.addListener(onStopCommand);
        chrome.runtime.onMessage.addListener(onStopClick);
        let contentScriptReady = false;
        
        mediaRecorder.onComplete = (recorder, blob) => {
          audioURL = window.URL.createObjectURL(blob);
          audioBlob = blob;
          globalAudioBlob = blob;
          globalAudioURL = audioURL;
          if(completeTabID) {
            console.log('Background: Sending encodingComplete with blob size:', blob.size);
            if (contentScriptReady) {
              chrome.tabs.sendMessage(completeTabID, {type: "encodingComplete", audioURL, hasAudioBlob: true});
            } else {
              setTimeout(() => {
                chrome.tabs.sendMessage(completeTabID, {type: "encodingComplete", audioURL, hasAudioBlob: true});
              }, 1000);
            }
          }
          mediaRecorder = null;
        }
        mediaRecorder.onEncodingProgress = (recorder, progress) => {
          if(completeTabID) {
            chrome.tabs.sendMessage(completeTabID, {type: "encodingProgress", progress: progress});
          }
        }

        const stopCapture = function() {
          let endTabId;
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            endTabId = tabs[0].id;
            if(mediaRecorder && startTabId === endTabId){
              mediaRecorder.finishRecording();
              chrome.tabs.create({url: "complete.html"}, (tab) => {
                completeTabID = tab.id;
                let completeCallback = () => {
                  const hasAudioBlob = audioBlob !== null;
                  console.log('Background: Sending createTab with hasAudioBlob:', hasAudioBlob);
                  chrome.tabs.sendMessage(tab.id, {type: "createTab", format: format, audioURL, hasAudioBlob: hasAudioBlob, startID: startTabId});
                }
                setTimeout(completeCallback, 500);
              });
              closeStream(endTabId);
            }
          })
        }

        const cancelCapture = function() {
          let endTabId;
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            endTabId = tabs[0].id;
            if(mediaRecorder && startTabId === endTabId){
              mediaRecorder.cancelRecording();
              closeStream(endTabId);
            }
          })
        }

        const closeStream = function(endTabId) {
          chrome.commands.onCommand.removeListener(onStopCommand);
          chrome.runtime.onMessage.removeListener(onStopClick);
          mediaRecorder.onTimeout = () => {};
          audioCtx.close();
          tabStream.getAudioTracks()[0].stop();
          sessionStorage.removeItem(endTabId);
          chrome.runtime.sendMessage({captureStopped: endTabId});
        }

        mediaRecorder.onTimeout = stopCapture;

        // Disabled audio feedback to prevent hearing own voice during recording
        // if(!muteTab) {
        //   let audio = new Audio();
        //   audio.srcObject = tabStream;
        //   audio.play();
        // }
      });
  });
}



// Global variables for audio processing
let globalAudioBlob = null;
let globalAudioURL = null;

//sends reponses to and from the popup menu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.currentTab && sessionStorage.getItem(request.currentTab)) {
    sendResponse(sessionStorage.getItem(request.currentTab));
  } else if (request.currentTab){
    sendResponse(false);
  } else if (request === "startCapture") {
    startCapture();
  } else if (request.type === 'contentScriptReady') {
    console.log('Background: Content script is ready');
    contentScriptReady = true;
  } else if (request.type === 'transcribeAudio') {
    console.log('Background: Received transcription request - TESTING');
    console.log('Background: Request format:', request.format);
    console.log('Background: Audio blob exists:', !!globalAudioBlob);
    
    // Get the stored audio blob and convert to data URL
    if (!globalAudioBlob) {
      console.log('Background: No audio blob available');
      sendResponse({ error: 'No audio data available for transcription' });
      return true;
    }
    
    console.log('Background: Audio blob found, size:', globalAudioBlob.size);
    
    console.log('Background: Converting blob to data URL, blob size:', globalAudioBlob.size);
    
    // Don't send a response, just process the transcription
    console.log('Background: Starting transcription process');
    
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      console.log('Background: Converted blob to data URL');
      
      const transcriptionService = new TranscriptionService();
      
      console.log('Background: Calling transcription service...');
      transcriptionService.transcribeAudio(dataURL, request.format)
        .then(transcription => {
          console.log('Background: Transcription successful, sending result');
          // Send the result to the content script
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
              console.log('Background: Sending result to tab:', tabs[0].id);
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'transcriptionResult',
                transcription: transcription
              });
            } else {
              console.log('Background: No active tab found');
            }
          });
        })
        .catch(error => {
          console.error('Background: Transcription failed:', error);
          // Send the error to the content script
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
              console.log('Background: Sending error to tab:', tabs[0].id);
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'transcriptionError',
                error: error.message
              });
            } else {
              console.log('Background: No active tab found for error');
            }
          });
        });
    };
    
    reader.onerror = (error) => {
      console.error('Background: Error reading blob:', error);
      // Send the error to the content script
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'transcriptionError',
            error: 'Failed to process audio data'
          });
        }
      });
    };
    
    reader.readAsDataURL(globalAudioBlob);
    
    return false; // Don't keep the message channel open
  } else if (request.type === 'generateMeetingMinutes') {
    console.log('Background: Received meeting minutes generation request');
    
    const meetingMinutesService = new MeetingMinutesService();
    
    meetingMinutesService.generateMeetingMinutes(request.transcription)
      .then(result => {
        console.log('Background: Meeting minutes generated successfully');
        // Send the result to the content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            console.log('Background: Sending meeting minutes result to tab:', tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'meetingMinutesResult',
              success: true,
              downloadUrl: result.downloadUrl,
              filename: result.filename
            });
          } else {
            console.log('Background: No active tab found');
          }
        });
      })
      .catch(error => {
        console.error('Background: Meeting minutes generation failed:', error);
        // Send the error to the content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            console.log('Background: Sending meeting minutes error to tab:', tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'meetingMinutesResult',
              success: false,
              error: error.message
            });
          } else {
            console.log('Background: No active tab found for error');
          }
        });
      });
    
    return false; // Don't keep the message channel open
  }
});

const startCapture = function() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    // CODE TO BLOCK CAPTURE ON YOUTUBE, DO NOT REMOVE
    // if(tabs[0].url.toLowerCase().includes("youtube")) {
    //   chrome.tabs.create({url: "error.html"});
    // } else {
      if(!sessionStorage.getItem(tabs[0].id)) {
        sessionStorage.setItem(tabs[0].id, Date.now());
        chrome.storage.sync.get({
          maxTime: 1200000,
          muteTab: false,
          format: "mp3",
          quality: 192,
          limitRemoved: false
        }, (options) => {
          let time = options.maxTime;
          if(time > 1200000) {
            time = 1200000
          }
          audioCapture(time, options.muteTab, options.format, options.quality, options.limitRemoved);
        });
        chrome.runtime.sendMessage({captureStarted: tabs[0].id, startTime: Date.now()});
      }
    // }
  });
};


chrome.commands.onCommand.addListener((command) => {
  if (command === "start") {
    startCapture();
  }
});

// Add transcription service to background script
class TranscriptionService {
  constructor() {}

  async getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['openaiApiKey'], (result) => {
        resolve(result.openaiApiKey || '');
      });
    });
  }

  async transcribeAudio(audioDataURL, format = 'wav') {
    try {
      console.log('Background: Starting transcription...');
      console.log('Background: Format:', format);

      // First, download the audio file
      const currentDate = new Date(Date.now()).toDateString();
      const fileName = `audio_${currentDate.replace(/\s/g, "_")}.${format}`;
      
      console.log('Background: Downloading audio file:', fileName);
      
      // Download the audio file using data URL
      try {
        console.log('Background: Using data URL for download');
        
        await new Promise((resolve, reject) => {
          chrome.downloads.download({
            url: audioDataURL,
            filename: fileName,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              console.log('Background: Audio file downloaded with ID:', downloadId);
              resolve(downloadId);
            }
          });
        });
      } catch (error) {
        console.error('Background: Error downloading file:', error);
        throw new Error('Failed to download audio file');
      }

      // Create FormData and append the audio file
      const formData = new FormData();
      
      // Convert data URL back to blob for FormData
      const blobResponse = await fetch(audioDataURL);
      const audioBlob = await blobResponse.blob();
      
      // Create a file from the blob with appropriate name and type
      let mimeType;
      if (format === 'mp3') {
        mimeType = 'audio/mpeg';
      } else if (format === 'wav') {
        mimeType = 'audio/wav';
      } else {
        // Default to wav if format is unknown
        mimeType = 'audio/wav';
      }
      
      console.log('Background: Creating file with format:', format, 'and mime type:', mimeType);
      console.log('Background: Converted blob size:', audioBlob.size, 'type:', audioBlob.type);
      
      // Create file with explicit type
      const file = new File([audioBlob], fileName, { type: mimeType });
      
      console.log('Background: File created:', file.name, 'size:', file.size, 'type:', file.type);
      
      // Verify the file type is correct
      if (file.type !== mimeType) {
        console.warn('Background: File type mismatch. Expected:', mimeType, 'Got:', file.type);
      }
      
      console.log('Background: Created file:', fileName, 'with type:', mimeType);
      
      formData.append('file', file);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      console.log('Background: FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log('Background: FormData key:', key, 'value:', value);
      }

      console.log('Background: Sending request to OpenAI API...');
      
      const apiKey = await this.getApiKey();
      if (!apiKey) throw new Error('No OpenAI API key set. Please enter your API key in the options.');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData
      });

      console.log('Background: Response status:', response.status);

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          console.log('Background: Error data:', errorData);
          errorMessage = errorData.error?.message || errorData.error || response.statusText;
        } catch (e) {
          console.log('Background: Could not parse error JSON:', e);
        }
        throw new Error(`Transcription failed: ${errorMessage}`);
      }

      const transcription = await response.text();
      console.log('Background: Transcription received:', transcription);
      return transcription;
      
    } catch (error) {
      console.error('Background: Transcription error details:', error);
      throw error;
    }
  }
}

// Make transcription service available globally
window.TranscriptionService = TranscriptionService;

// Add meeting minutes service to background script
class MeetingMinutesService {
  constructor() {}

  async getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['openaiApiKey'], (result) => {
        resolve(result.openaiApiKey || '');
      });
    });
  }

  async generateMeetingMinutes(transcription) {
    try {
      console.log('Background: Starting meeting minutes generation...');
      
      // Create the prompt for meeting minutes generation
      const prompt = `Based on the following meeting transcription, create comprehensive meeting minutes in a professional format. Include:

1. Meeting Summary
2. Key Points Discussed
3. Action Items
4. Decisions Made
5. Next Steps
6. Attendees (if mentioned)

Format the output as a clean, professional document structure.

Transcription:
${transcription}`;

      console.log('Background: Sending request to OpenAI for meeting minutes...');
      
      const apiKey = await this.getApiKey();
      if (!apiKey) throw new Error('No OpenAI API key set. Please enter your API key in the options.');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a professional meeting minutes generator. Create clear, structured meeting minutes from transcriptions.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      console.log('Background: Response status:', response.status);

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          console.log('Background: Error data:', errorData);
          errorMessage = errorData.error?.message || errorData.error || response.statusText;
        } catch (e) {
          console.log('Background: Could not parse error JSON:', e);
        }
        throw new Error(`Meeting minutes generation failed: ${errorMessage}`);
      }

      const data = await response.json();
      const meetingMinutes = data.choices[0].message.content;
      console.log('Background: Meeting minutes generated successfully');

      // Create DOCX file content
      const docxContent = this.createDocxContent(meetingMinutes);
      
      // Create blob and download
      const currentDate = new Date(Date.now()).toDateString();
      const filename = `meeting_minutes_${currentDate.replace(/\s/g, "_")}.docx`;
      
      const blob = new Blob([docxContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const downloadUrl = URL.createObjectURL(blob);
      
      // Download the file
      await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('Background: Meeting minutes file downloaded with ID:', downloadId);
            resolve(downloadId);
          }
        });
      });

      return {
        downloadUrl: downloadUrl,
        filename: filename
      };
      
    } catch (error) {
      console.error('Background: Meeting minutes generation error details:', error);
      throw error;
    }
  }

  createDocxContent(meetingMinutes) {
    // Create a properly formatted text file that can be opened in Word
    // This creates a .docx file that Word can open and format properly
    
    const formattedContent = `MEETING MINUTES

${meetingMinutes}

---
Generated by Mahin's Recorder Extension
Date: ${new Date().toLocaleString()}`;

    return new TextEncoder().encode(formattedContent);
  }
}

// Make meeting minutes service available globally
window.MeetingMinutesService = MeetingMinutesService;

// Fallback recording function that records tab and mic separately
function startFallbackRecording(tabStream, micStream, format, quality, limitRemoved, timeLimit, muteTab) {
  console.log('Background: Starting fallback recording method (MIXED)');

  let startTabId;
  let completeTabID;
  let audioURL = null;
  let audioBlob = null;

  chrome.tabs.query({active:true, currentWindow: true}, (tabs) => startTabId = tabs[0].id);

  // Create a new AudioContext and mix tab + mic
  const audioCtx = new AudioContext();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const micSource = audioCtx.createMediaStreamSource(micStream);

  // Create gain nodes for mixing
  const mixer = audioCtx.createGain();
  const tabGain = audioCtx.createGain();
  const micGain = audioCtx.createGain();
  tabGain.gain.value = 0.7;
  micGain.gain.value = 0.8;
  tabSource.connect(tabGain);
  micSource.connect(micGain);
  tabGain.connect(mixer);
  micGain.connect(mixer);

  // Create a MediaStreamDestination for the mixed audio
  const destination = audioCtx.createMediaStreamDestination();
  mixer.connect(destination);

  // Optionally monitor the mixed audio
  // if (!muteTab) {
  //   try {
  //     const monitor = audioCtx.createMediaStreamSource(destination.stream);
  //     monitor.connect(audioCtx.destination);
  //     console.log('Background: Monitoring mixed audio (tab + mic) enabled (fallback).');
  //   } catch (e) {
  //     console.error('Background: Failed to enable monitoring of mixed audio (fallback):', e);
  //   }
  // }

  // Create a MediaStreamSource from the mixed stream for the Recorder
  const mixedSource = audioCtx.createMediaStreamSource(destination.stream);
  let mediaRecorder = new Recorder(mixedSource);
  mediaRecorder.setEncoding(format);
  if(limitRemoved) {
    mediaRecorder.setOptions({timeLimit: 10800});
  } else {
    mediaRecorder.setOptions({timeLimit: timeLimit/1000});
  }
  if(format === "mp3") {
    mediaRecorder.setOptions({mp3: {bitRate: quality}});
  }

  mediaRecorder.onComplete = (recorder, blob) => {
    audioURL = window.URL.createObjectURL(blob);
    audioBlob = blob;
    globalAudioBlob = blob;
    globalAudioURL = audioURL;
    if(completeTabID) {
      console.log('Background: Sending encodingComplete with blob size:', blob.size);
      chrome.tabs.sendMessage(completeTabID, {type: "encodingComplete", audioURL, hasAudioBlob: true});
    }
    mediaRecorder = null;
  }
  mediaRecorder.onEncodingProgress = (recorder, progress) => {
    if(completeTabID) {
      chrome.tabs.sendMessage(completeTabID, {type: "encodingProgress", progress: progress});
    }
  }

  // Set up stop/cancel handlers
  function onStopCommand(command) {
    if (command === "stop") {
      stopCapture();
    }
  }
  function onStopClick(request) {
    if(request === "stopCapture") {
      stopCapture();
    } else if (request === "cancelCapture") {
      cancelCapture();
    }
  }
  chrome.commands.onCommand.addListener(onStopCommand);
  chrome.runtime.onMessage.addListener(onStopClick);

  const stopCapture = function() {
    let endTabId;
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      endTabId = tabs[0].id;
      if(startTabId === endTabId){
        mediaRecorder.finishRecording();
        chrome.tabs.create({url: "complete.html"}, (tab) => {
          completeTabID = tab.id;
          let completeCallback = () => {
            const hasAudioBlob = audioBlob !== null;
            console.log('Background: Sending createTab with hasAudioBlob:', hasAudioBlob);
            chrome.tabs.sendMessage(tab.id, {type: "createTab", format: format, audioURL, hasAudioBlob: hasAudioBlob, startID: startTabId});
          }
          setTimeout(completeCallback, 500);
        });
        closeStream(endTabId);
      }
    })
  }
  const cancelCapture = function() {
    let endTabId;
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      endTabId = tabs[0].id;
      if(startTabId === endTabId){
        mediaRecorder.cancelRecording();
        closeStream(endTabId);
      }
    })
  }
  const closeStream = function(endTabId) {
    chrome.commands.onCommand.removeListener(onStopCommand);
    chrome.runtime.onMessage.removeListener(onStopClick);
    mediaRecorder.onTimeout = () => {};
    audioCtx.close();
    tabStream.getAudioTracks()[0].stop();
    micStream.getAudioTracks()[0].stop();
    sessionStorage.removeItem(endTabId);
    chrome.runtime.sendMessage({captureStopped: endTabId});
  }
  mediaRecorder.onTimeout = stopCapture;
}
