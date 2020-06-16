// Simplified app for using webrtc to chat
// This can be run as a local server:
// firebase serve --only hosting
// Or deployed to the GC (assuming hosting and other details are set up correctly):
// firebase deploy
// Note that when set up to run locally it really is running on one machine so is not available
// for real testing

// Original web description (missing many cogent details):
// https://webrtc.org/getting-started/firebase-rtc-codelab

// Original source:
// https://github.com/webrtc/FirebaseRTC
// Check Issues for discussions, and the solution branch for the supposedly working final code:
// https://github.com/webrtc/FirebaseRTC/tree/solution

// This app requires quite a bit more knowledge of GC and webrtc to do much with.
// Relevant GC docs:
// https://firebase.google.com/docs/web/setup
// https://firebase.google.com/docs/hosting/quickstart


// MD is 'Material Design', Google's CSS design system, used in the accompanying HTML
// https://material.io/develop/web/components/ripples/
mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

// Default STUN configuration - Change these if you have a different STUN or TURN server.
// Turn would be required if hosts cannot connect directly (TURN servers usually are not free)
// See the following for STUN, TURN, and ICE info: 
// https://www.twilio.com/docs/stun-turn/faq
const orig_configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};
const configuration = {
  iceServers:
   [ { url: 'stun:global.stun.twilio.com:3478?transport=udp',
       urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
     { url: 'turn:global.turn.twilio.com:3478?transport=udp',
       username:
        '2a1f109d15d1bf9272d7d1a5822ffd1627b1d8b7476280d1f13578bbcf92db65',
       urls: 'turn:global.turn.twilio.com:3478?transport=udp',
       credential: 'astH50TO78AzzPWRPHmb7kdoJ8NwXEQsp43s0v8v5rU=' },
     { url: 'turn:global.turn.twilio.com:3478?transport=tcp',
       username:
        '2a1f109d15d1bf9272d7d1a5822ffd1627b1d8b7476280d1f13578bbcf92db65',
       urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
       credential: 'astH50TO78AzzPWRPHmb7kdoJ8NwXEQsp43s0v8v5rU=' },
     { url: 'turn:global.turn.twilio.com:443?transport=tcp',
       username:
        '2a1f109d15d1bf9272d7d1a5822ffd1627b1d8b7476280d1f13578bbcf92db65',
       urls: 'turn:global.turn.twilio.com:443?transport=tcp',
       credential: 'astH50TO78AzzPWRPHmb7kdoJ8NwXEQsp43s0v8v5rU=' } ],
  iceCandidatePoolSize: 10,
};

// The RTCPeerConnection
let peerConnection = null;

// The media streams for local and remote media
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream
let localStream = null;
let remoteStream = null;

// The dialog which prompts for a room id (for the caller)
let roomDialog = null
let roomNameDialog = null
let roomIssueDialog = null

// The in-use roomId as specifed by the users.
let roomId = null;

// Safari can have trouble adding individual tracks, so will need a way to check for it
// https://github.com/webrtc/FirebaseRTC/issues/16
// Safari 3.0+ "[object HTMLElementConstructor]" 
function isSafari() {
  // Get the user-agent string 
  let userAgentString = navigator.userAgent
        
  // Detect Chrome 
  let chromeAgent = userAgentString.indexOf("Chrome") > -1

  // Detect Safari 
  let safariAgent = userAgentString.indexOf("Safari") > -1

  if ((chromeAgent) && (safariAgent)) {
    return false
  } else if (safariAgent) {
    return true
  }

  return false
}

function toggleWebGazer() {
  if (document.getElementById('eye-tracking-choice').checked == true) {
    // start up webgazer if experimenting with the technology
      startWebGazer()
  } else {
    webgazer.end()
    webgazer.stopVideo()
  }
}

function toggleStatus() {
  if (document.getElementById('connection-status-choice').checked == true) {
    document.getElementById('status-display').style.display = "block"
  } else {
    document.getElementById('status-display').style.display = "none"
  }
}

function toggleAudio() {
  if (document.getElementById('audio-controls-choice').checked == true) {
    document.getElementById('audio-controls').style.display = "block"
  } else {
    document.getElementById('audio-controls').style.display = "none"
  }  
}

// Automatically adds a carriage return on the end of the status text...
function addStatusText(statusText) {
  console.log(statusText)
  document.getElementById("status-text").value += statusText + "\n"
}

// Add listeners to all of the buttons in the app, create the dialog for the room info
function init() {
  document.querySelector('#sendBtn').addEventListener('click', sendText);
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  document.querySelector('#eye-tracking-choice').addEventListener('change', toggleWebGazer);
  document.querySelector('#connection-status-choice').addEventListener('change', toggleStatus);
  document.querySelector('#audio-controls-choice').addEventListener('change', toggleAudio);

  // Turn the room not-found warning off by default
  var displayStyle = document.getElementById('room-not-found')
  displayStyle.style.display = "none"

  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
  roomNameDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-name-dialog'));
  roomIssueDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-issue-dialog'));
}

function getRoomName() {
document.querySelector('#confirmNameBtn').
      addEventListener('click', async () => {
        roomName = document.querySelector('#room-name').value;
        console.log('Room Name: ', roomName);
        await createRoomWithName(roomName);
      }, {once: true});

    document.querySelector('#cancelNameBtn').
      addEventListener('click', async () => {
        document.querySelector('#joinBtn').disabled = false;
        document.querySelector('#createBtn').disabled = false;      
      }, {once: true});
  roomNameDialog.open();
}

// Should have a name at this point
// Not checking for duplicates...
async function createRoomWithName(roomName) {

  // Get a db reference, then access the db to get the rooms collection
  const db = firebase.firestore();
  // This will create a document reference with an autogenerated ID
  const roomRef = await db.collection('rooms').doc(roomName);

  // The name is the id (simpler that way, but could be collisions)
  roomId = roomName

  // Create the key object used for WebRTC communication:
  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      addStatusText("Final ICE candidate received")
      return;
    }
    addStatusText("ICE candidate: " + event.candidate.candidate)
    //console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Create an SDP offer
  var offer = null
  try {
    offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
  } catch (e) {
    addStatusText("Failed to create offer: " + e)
    addStatusText("May need to reload the app!")
    hangUp()
    return
  } finally {
  }

  const roomWithOffer = {
    offer: {
        type: offer.type,
        sdp: offer.sdp
    }
  }
  addStatusText("Offer type: " + offer.type)
  
  // Assuming the firestore ref was correctly created above, use it now to store
  // the offer information
  roomRef.set(roomWithOffer);

  //Display the offer information
  roomId = roomRef.id;
  document.querySelector('#currentRoom').innerText = `Room: ${roomName}`
  // Code for creating room above

  peerConnection.addEventListener('track', event => {
    if (!event.streams) {
      addStatusText("Error-no remote stream")
    } else {
      addStatusText("Remote joiner (caller) track streams: " + event.streams.length)
      addStatusText("Remote joiner (caller) track is active: " + event.streams[0].active)
    }

    // Safari can have trouble adding individual tracks
    // https://github.com/webrtc/FirebaseRTC/issues/16
    if (isSafari()) {
      addStatusText("Safari browser detected")
      remoteStream = event.streams[0]
      document.querySelector('#remoteVideo').srcObject = event.streams[0]
    } else {
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    }
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    addStatusText("Updated room id: " + snapshot.id)
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      
      const answer = new RTCSessionDescription(data.answer)
      addStatusText("Setting remote description type: " + answer.type)
      await peerConnection.setRemoteDescription(answer);
    }
  });
  // Listening for remote session description above

  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  // Enable chat at this point
  document.querySelector('#sendBtn').disabled = false;
  roomRef.collection('chatText').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      let data = change.doc.data();
      document.getElementById("chat-text").value += data.chatText.text + "\n"
    })
  })
}


// Create a chat room
async function createRoom() {
  // set the buttons to the relevant states
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;
  getRoomName()
}

// Join a pre-existing chat room
function joinRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;

  document.querySelector('#confirmJoinBtn').
      addEventListener('click', async () => {
        const roomId = document.querySelector('#join-room-name').value;
        console.log('Join room: ', roomId);
        document.querySelector(
            '#currentRoom').innerText = `Room: ${roomId}`;
        await joinRoomById(roomId);
      }, {once: true});

    document.querySelector('#cancelJoinBtn').
      addEventListener('click', async () => {
        document.querySelector('#joinBtn').disabled = false;
        document.querySelector('#createBtn').disabled = false;
        document.querySelector('#hangupBtn').disabled = false;

        // Turn the room not-found warning off if the user cancels out
        var displayStyle = document.getElementById('room-not-found')
        displayStyle.style.display = "none"
      }, {once: true});
  roomDialog.open();
}

async function joinRoomById(theRoomId) {
  roomId = theRoomId
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);
  var displayStyle = document.getElementById('room-not-found')

  if (roomSnapshot.exists) {
    displayStyle.style.display = "none"

    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        addStatusText("Final ICE candidate received")
        return;
      }
      addStatusText("ICE candidate: " + event.candidate.candidate)
      //console.log('Got candidate: ', event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });


    peerConnection.addEventListener('track', event => {
      if (!event.streams) {
        addStatusText("Error-no remote stream")
      } else {
        addStatusText("Remote (creator) callee track streams: " + event.streams.length)
        addStatusText("Remote (creator) callee track is active: " + event.streams[0].active)
      }
      // Safari can have trouble adding individual tracks
      // https://github.com/webrtc/FirebaseRTC/issues/16
      if (isSafari()) {
        addStatusText("Safari browser detected")
        remoteStream = event.streams[0]
        document.querySelector('#remoteVideo').srcObject = event.streams[0]
      } else {
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.addTrack(track);
        });
      }
    });

    // Enable chat at this point
    document.querySelector('#sendBtn').disabled = false;
    roomRef.collection('chatText').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        let data = change.doc.data();
        document.getElementById("chat-text").value += data.chatText.text + "\n"
      })
    })

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    addStatusText("Offer: " + offer)

    var answer = null
    try {
      addStatusText("Setting remote description to offer")
      await peerConnection.setRemoteDescription(offer)
      addStatusText("Awaiting peer connectiong createAnswer()")
      answer = await peerConnection.createAnswer()
      addStatusText("Awaiting peer connection setLocalDescription()")
      await peerConnection.setLocalDescription(answer)
    } catch (e) {
      addStatusText("Failed to create offer: " + e)
      addStatusText("May need to reload the app!")
      hangUp()
      return
    } finally {
    }

    const roomWithAnswer = {
        answer: {
            type: answer.type,
            sdp: answer.sdp
        }
    }

    await roomRef.update(roomWithAnswer);

    roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  } else {
    displayStyle.style.display = "block"
    joinRoom()
  }
}

// Face tracking functionality
// The code (from Brown) is buggy, and results are not great--should I even bother keeping it?
function startWebGazer() {
  var oldX = -1, oldY = -1
  var leftCount = 0, rightCount = 0
  var last60 = 0
  var theCount = 0

  webgazer.setGazeListener(function (data, elapsedTime) {
    if (data == null) {
      return;
    }
    var xprediction = data.x; //these x coordinates are relative to the viewport
    var yprediction = data.y; //these y coordinates are relative to the viewport

    var message = ""
    if (oldX > xprediction) {
      message = "left: " + leftCount
      rightCount = 0
      leftCount++
      theCount++
      last60--
    } else if (oldX < xprediction) {
      message = "right: " + rightCount
      leftCount = 0
      rightCount++
      theCount++
      last60++
    }
    oldX = xprediction

    // Experiment to see if there are trends...
    if (theCount == 60) {
      //console.log("Last 60 is: " + last60)

      panDelta(last60/60)
      
      last60 = 0
      theCount = 0
    }

    if (rightCount > 10) {
      let feedbackElement = document.querySelector('#webgazerFaceFeedbackBox')

      feedbackElement.style.borderRight = "solid blue"
      feedbackElement.style.borderLeft = feedbackElement.style.border
      message = "long right"
      console.log(message)
      rightCount = 0
    } else if (leftCount > 10) {
      let feedbackElement = document.querySelector('#webgazerFaceFeedbackBox')

      feedbackElement.style.borderLeft = "solid blue"
      feedbackElement.style.borderRight = feedbackElement.style.border
      message = "long left"
      console.log(message)
      leftCount = 0
    }


    //console.log(message); 
  }).begin();
}

// Get access to the user media
// Note that localStream and remoteStream are used elsewhere, so this code 
// must be called (and succeed) before the app can work successfully.
async function openUserMedia(e) {

  // Ref for getUsermedia: 
  // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
  const stream = await navigator.mediaDevices.getUserMedia(
    // Require both a video and an audio track
    { video: true, audio: true });

  // Associate the streams with the video elements in the .html
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  // Only enable these buttons (and allow the associated functionality) 
  // after media commection has been established
  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
  
}

// Stop the communication, disconnect all streams, and reset the app's buttons
// to the default state
// Note that the room is deleted upon hangup
async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#sendBtn').disabled = true;
    document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  //document.location.reload(true);
}

function sendText() {
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(`${roomId}`).collection('chatText')
    const text = document.getElementById('chat-entry').value
    const chatDoc = {
      chatText: {
          text: text
      }
    }
    // Add the text to the db
    roomRef.add(chatDoc)
      .then(function(docRef) {
        //console.log("Document written with ID: ", docRef.id)
        // Clear the text entry
        document.getElementById('chat-entry').value = ''
    })
      .catch(function(error) {
        console.error("Error adding document: ", error)
    })
    
  }
  
}

// Register listeners for some interesting events.  Note that nothing is done here
// except logging the info (this is probably not ideal)
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection#events
function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    addStatusText("ICE gathering: " + peerConnection.iceGatheringState)
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    addStatusText("Connection: " + peerConnection.connectionState)

    // if the connection is lost hang up
    if ((peerConnection.connectionState == "disconnected") || (peerConnection.connectionState == "failed")) {
      document.querySelector('#room-issue-text').innerText = `Room closed with result: ${peerConnection.connectionState}`
      roomIssueDialog.open();
      hangUp()
    }
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    addStatusText("Signaling: " + peerConnection.signalingState)
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    addStatusText("ICE connection: " + peerConnection.iceConnectionState)
  });
}



// Call the init code and kick off this app
init();
