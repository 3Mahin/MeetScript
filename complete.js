document.addEventListener('DOMContentLoaded', () => {
  const encodeProgress = document.getElementById('encodeProgress');
  const saveButton = document.getElementById('saveCapture');
  const transcribeButton = document.getElementById('transcribe');
  const closeButton = document.getElementById('close');
  const review = document.getElementById('review');
  const status = document.getElementById('status');
  const transcriptionSection = document.getElementById('transcriptionSection');
  const transcriptionText = document.getElementById('transcriptionText');
  const transcriptionStatus = document.getElementById('transcriptionStatus');
  const saveTranscriptionButton = document.getElementById('saveTranscription');
  
  let format;
  let audioURL;
  let audioBlob;
  let encoding = false;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.type === "createTab") {
      // Tell background script that content script is ready
      chrome.runtime.sendMessage({type: "contentScriptReady"});
      
      format = request.format;
      let startID = request.startID;
      status.innerHTML = "Please wait..."
      closeButton.onclick = () => {
        chrome.runtime.sendMessage({cancelEncodeID: startID});
        chrome.tabs.getCurrent((tab) => {
          chrome.tabs.remove(tab.id);
        });
      }

      //if the encoding completed before the page has loaded
      if(request.audioURL) {
        encodeProgress.style.width = '100%';
        status.innerHTML = "File is ready!"
        console.log('Content script: createTab with audioURL, hasAudioBlob:', request.hasAudioBlob);
        generateSave(request.audioURL, request.hasAudioBlob ? 'available' : null);
      } else {
        encoding = true;
        console.log('Content script: Encoding in progress, waiting for completion...');
      }
      

    }

    //when encoding completes
    if(request.type === "encodingComplete" && encoding) {
      encoding = false;
      status.innerHTML = "File is ready!";
      encodeProgress.style.width = '100%';
      console.log('Content script: encodingComplete with hasAudioBlob:', request.hasAudioBlob);
      generateSave(request.audioURL, request.hasAudioBlob ? 'available' : null);
    } else if(request.type === "encodingComplete") {
      console.log('Content script: encodingComplete received but encoding was false');
    } else if(request.type === "transcriptionResult") {
      console.log('Content script: Received transcription result:', request.transcription);
      
      // Display the transcription
      transcriptionText.innerHTML = `<p><strong>Transcription:</strong></p><p>${request.transcription}</p>`;
      transcriptionStatus.innerHTML = 'Transcription completed successfully!';
      
      // Show save transcription button
      saveTranscriptionButton.style.display = 'inline-block';
      saveTranscriptionButton.onclick = () => {
        generateMeetingMinutes(request.transcription);
      };
      
      // Add copy to clipboard functionality
      transcriptionText.onclick = () => {
        navigator.clipboard.writeText(request.transcription).then(() => {
          transcriptionStatus.innerHTML = 'Transcription copied to clipboard!';
          setTimeout(() => {
            transcriptionStatus.innerHTML = 'Transcription completed successfully!';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy to clipboard:', err);
        });
      };
      transcriptionText.style.cursor = 'pointer';
      transcriptionText.title = 'Click to copy to clipboard';
      
      // Show transcribe button again
      transcribeButton.style.display = 'inline-block';
    } else if(request.type === "transcriptionError") {
      console.log('Content script: Received transcription error:', request.error);
      transcriptionStatus.innerHTML = `Error: ${request.error}`;
      transcriptionSection.style.display = 'block';
      transcribeButton.style.display = 'inline-block';
    }
    //updates encoding process bar upon messages
    if(request.type === "encodingProgress" && encoding) {
      encodeProgress.style.width = `${request.progress * 100}%`;
    }
    function generateSave(url, blob) { //creates the save button
      const currentDate = new Date(Date.now()).toDateString();
      saveButton.onclick = () => {
        chrome.downloads.download({url: url, filename: `${currentDate}.${format}`, saveAs: true});
      };
      saveButton.style.display = "inline-block";
      
      console.log('Content script: generateSave called with blob:', blob);
      
      // Store the blob for transcription and enable transcription button only if blob exists
      if (blob === 'available') {
        // Don't store the blob in content script, it's stored in background
        console.log('Content script: Audio blob available in background script');
        
        // Enable transcription button
        transcribeButton.onclick = async () => {
          await handleTranscription();
        };
        transcribeButton.style.display = "inline-block";
        console.log('Content script: Transcription button enabled');
      } else {
        console.log('Content script: No blob provided, transcription button not enabled');
      }
    }
    
    async function handleTranscription() {
      try {
        // Show transcription section
        transcriptionSection.style.display = 'block';
        transcriptionStatus.innerHTML = 'Downloading audio file...';
        transcribeButton.style.display = 'none'; // Hide button during transcription
        
        // Show loading indicator
        transcriptionText.innerHTML = '<p><em>Downloading audio file and sending to OpenAI...</em></p>';
        
        console.log('Content script: Starting transcription process with format:', format);
        
                // Send transcription request to background script (blob is stored in background)
        console.log('Content script: About to send transcription request');
        chrome.runtime.sendMessage({
          type: 'transcribeAudio',
          format: format
        });
        
        // Update status immediately
        transcriptionStatus.innerHTML = 'Processing transcription... Please wait.';
        console.log('Content script: Transcription request sent');
        
      } catch (error) {
        console.error('Transcription error:', error);
        transcriptionStatus.innerHTML = `Error: ${error.message}`;
        transcriptionSection.style.display = 'block';
        transcribeButton.style.display = 'inline-block';
      }
    }
  });
  review.onclick = () => {
    chrome.tabs.create({url: "https://chrome.google.com/webstore/detail/chrome-audio-capture/kfokdmfpdnokpmpbjhjbcabgligoelgp/reviews"});
  }

  async function generateMeetingMinutes(transcription) {
    try {
      // Show loading state
      saveTranscriptionButton.innerHTML = 'Generate Meeting Minutes...';
      saveTranscriptionButton.style.pointerEvents = 'none';
      
      // Send request to background script to generate meeting minutes
      chrome.runtime.sendMessage({
        type: 'generateMeetingMinutes',
        transcription: transcription
      });
      
    } catch (error) {
      console.error('Error generating meeting minutes:', error);
      saveTranscriptionButton.innerHTML = 'Save Transcription';
      saveTranscriptionButton.style.pointerEvents = 'auto';
      alert('Error generating meeting minutes: ' + error.message);
    }
  }

  // Listen for meeting minutes results
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'meetingMinutesResult') {
      console.log('Content script: Received meeting minutes result');
      
      // Reset button state
      saveTranscriptionButton.innerHTML = 'Save Transcription';
      saveTranscriptionButton.style.pointerEvents = 'auto';
      
      if (request.success) {
        transcriptionStatus.innerHTML = 'Meeting minutes generated successfully!';
      } else {
        transcriptionStatus.innerHTML = `Error: ${request.error}`;
      }
    }
  });

})
