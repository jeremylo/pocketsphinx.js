import CallbackManager from './callbackManager.js';

// These will be initialized later
var recognizer, recorder, callbackManager, audioContext, outputContainer;
// Only when both recorder and recognizer do we have a ready application
var isRecorderReady = false;
var isRecognizerReady = false;

// A convenience function to post a message to the recognizer and associate
// a callback to its response
function postRecognizerJob(message, callback) {
    var msg = message || {};
    if (callbackManager) msg.callbackId = callbackManager.add(callback);
    if (recognizer) recognizer.postMessage(msg);
};

// This function initializes an instance of the recorder
// it posts a message right away and calls onReady when it
// is ready so that onmessage can be properly set
function spawnRecognizerWorker(workerURL, onReady) {
    recognizer = new Worker(workerURL);
    recognizer.onmessage = function (event) {
        onReady(recognizer);
    };
    // As arguments, you can pass non-default path to pocketsphinx.js and pocketsphinx.wasm:
    // recognizer.postMessage({'pocketsphinx.wasm': '/path/to/pocketsphinx.wasm', 'pocketsphinx.js': '/path/to/pocketsphinx.js'});
    recognizer.postMessage({});
};

// This updates the UI when the app might get ready
// Only when both recorder and recognizer are ready do we enable the buttons
function updateUI() {
    if (isRecorderReady && isRecognizerReady) startBtn.disabled = stopBtn.disabled = false;
};

// This is just a logging window where we display the status
function updateStatus(newStatus) {
    document.getElementById('current-status').innerHTML += "<br/>" + newStatus;
};

// A not-so-great recording indicator
function displayRecording(display) {
    if (display) document.getElementById('recording-indicator').innerHTML = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    else document.getElementById('recording-indicator').innerHTML = "";
};

// Callback function once the user authorises access to the microphone
// in it, we instanciate the recorder
function startUserMedia(stream) {
    var input = audioContext.createMediaStreamSource(stream);
    // Firefox hack https://support.mozilla.org/en-US/questions/984179
    window.firefox_audio_hack = input;
    var audioRecorderConfig = { errorCallback: function (x) { updateStatus("Error from recorder: " + x); } };
    recorder = new AudioRecorder(input, audioRecorderConfig);
    // If a recognizer is ready, we pass it to the recorder
    if (recognizer) {
        recorder.consumers = [recognizer];
    }

    isRecorderReady = true;
    updateUI();
    updateStatus("Audio recorder ready");
};

// To display the hypothesis sent by the recognizer
function updateOutputContainer(hyp) {
    if (outputContainer) {
        outputContainer.innerHTML = hyp;
    }
};


// This starts recording. We first need to get the id of the keyword search to use.
async function startRecording() {
    await audioContext.resume();
    if (recorder && recorder.start(document.getElementById('keyword').value)) {
        displayRecording(true);
    }
}

// Stops recording
async function stopRecording() {
    await audioContext.suspend();
    recorder && recorder.stop();
    displayRecording(false);
};

// Called once the recognizer is ready
// We then add the grammars to the input select tag and update the UI
var recognizerReady = function () {
    updateKeywords();
    isRecognizerReady = true;
    updateUI();
    updateStatus("Recognizer ready");
};

// We get the grammars defined below and fill in the input select tag
var updateKeywords = function () {
    var selectTag = document.getElementById('keyword');
    for (var i = 0; i < keywordIds.length; i++) {
        var newElt = document.createElement('option');
        newElt.value = keywordIds[i].id;
        newElt.innerHTML = keywordIds[i].title;
        selectTag.appendChild(newElt);
    }
};

// This adds a keyword search from the array
// We add them one by one and call it again as
// a callback.
// Once we are done adding all grammars, we can call
// recognizerReady()
var feedKeyword = function (g, index, id) {
    if (id && (keywordIds.length > 0)) keywordIds[0].id = id.id;
    if (index < g.length) {
        keywordIds.unshift({ title: g[index].title })
        postRecognizerJob({ command: 'addKeyword', data: g[index].g },
            function (id) { feedKeyword(keywords, index + 1, { id: id }); });
    } else {
        recognizerReady();
    }
};

// This adds words to the recognizer. When it calls back, we add grammars
var feedWords = function (words) {
    postRecognizerJob({ command: 'addWords', data: words },
        function () { feedKeyword(keywords, 0); });
};

// This initializes the recognizer. When it calls back, we add words
var initRecognizer = function () {
    // You can pass parameters to the recognizer, such as : {command: 'initialize', data: [["-hmm", "my_model"], ["-fwdflat", "no"]]}
    postRecognizerJob({ command: 'initialize', data: [["-kws_threshold", "1e-25"]] },
        function () {
            if (recorder) recorder.consumers = [recognizer];
            feedWords(wordList);
        });
};

// When the page is loaded, we spawn a new recognizer worker and call getUserMedia to
// request access to the microphone
window.onload = function () {
    outputContainer = document.getElementById("output");
    updateStatus("Initializing web audio and speech recognizer, waiting for approval to access the microphone");
    callbackManager = new CallbackManager();
    spawnRecognizerWorker("js/recognizer-worker.js", function (worker) {
        // This is the onmessage function, once the worker is fully loaded
        worker.onmessage = function (e) {
            // This is the case when we have a callback id to be called
            if (e.data.hasOwnProperty('id')) {
                var clb = callbackManager.get(e.data['id']);
                var data = {};
                if (e.data.hasOwnProperty('data')) data = e.data.data;
                if (clb) clb(data);
            }
            // This is a case when the recognizer has a new count number
            if (e.data.hasOwnProperty('hyp')) {
                var newCount = e.data.hyp;
                if (e.data.hasOwnProperty('final') && e.data.final) newCount = "Final: " + newCount;
                updateOutputContainer(newCount);
            }
            // This is the case when we have an error
            if (e.data.hasOwnProperty('status') && (e.data.status == "error")) {
                updateStatus("Error in " + e.data.command + " with code " + e.data.code);
            }
        };
        // Once the worker is fully loaded, we can call the initialize function
        initRecognizer();
    });

    // The following is to initialize Web Audio
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        window.URL = window.URL || window.webkitURL;
        audioContext = new AudioContext();
    } catch (e) {
        updateStatus("Error initializing Web Audio browser");
    }

    if (navigator.getUserMedia) {
        navigator.getUserMedia({ audio: true }, startUserMedia, function (e) {
            updateStatus("No live audio input in this browser");
        });
    } else {
        updateStatus("No web audio support in this browser");
    }

    // Wiring JavaScript to the UI
    var startBtn = document.getElementById('startBtn');
    var stopBtn = document.getElementById('stopBtn');
    startBtn.disabled = true;
    stopBtn.disabled = true;
    startBtn.onclick = startRecording;
    stopBtn.onclick = stopRecording;
};

// This is the list of words that need to be added to the recognizer
// This follows the CMU dictionary format
var wordList = [["ONE", "W AH N"], ["TWO", "T UW"], ["THREE", "TH R IY"], ["FOUR", "F AO R"], ["FIVE", "F AY V"], ["SIX", "S IH K S"], ["SEVEN", "S EH V AH N"], ["EIGHT", "EY T"], ["NINE", "N AY N"], ["ZERO", "Z IH R OW"], ["NEW-YORK", "N UW Y AO R K"], ["NEW-YORK-CITY", "N UW Y AO R K S IH T IY"], ["PARIS", "P AE R IH S"], ["PARIS(2)", "P EH R IH S"], ["SHANGHAI", "SH AE NG HH AY"], ["SAN-FRANCISCO", "S AE N F R AE N S IH S K OW"], ["LONDON", "L AH N D AH N"], ["BERLIN", "B ER L IH N"], ["SUCKS", "S AH K S"], ["ROCKS", "R AA K S"], ["IS", "IH Z"], ["NOT", "N AA T"], ["GOOD", "G IH D"], ["GOOD(2)", "G UH D"], ["GREAT", "G R EY T"], ["WINDOWS", "W IH N D OW Z"], ["LINUX", "L IH N AH K S"], ["UNIX", "Y UW N IH K S"], ["MAC", "M AE K"], ["AND", "AE N D"], ["AND(2)", "AH N D"], ["O", "OW"], ["S", "EH S"], ["X", "EH K S"]];
var keywords = [{ title: "SIX", g: "SIX" }, { title: "ROCKS", g: "ROCKS" }, { title: "GREAT", g: "GREAT" }];
var keywordIds = [];
