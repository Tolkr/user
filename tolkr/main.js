// Importation des modules Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
// import { getDatabase, ref, push, onValue, set, update, remove, get } from 'https://tolkr-42e29-default-rtdb.europe-west1.firebasedatabase.app/';
import { getDatabase, ref, push, onValue, set, update, remove, get } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';


// ... other imports ...
// import { getDatabase } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';


// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBxfD3rum-yA9vTVpHQV_c4hlJ71YoQIYQ",
  authDomain: "tolkr-42e29.firebaseapp.com",
  projectId: "tolkr-42e29",
  storageBucket: "tolkr-42e29.appspot.com",
  messagingSenderId: "177312382283",
  appId: "1:177312382283:web:0aa1095f5d12a23665bcce",
  measurementId: "G-PENKVPE3DK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const database = getDatabase(app);
// Initialize Firebase Realtime Database
const database = getDatabase(app, 'https://tolkr-42e29-default-rtdb.europe-west1.firebasedatabase.app/'); // Use the correct URL
const analytics = getAnalytics(app);


// Sélection des éléments de l'interface
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callInput = document.getElementById('callInput');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');

let localStream;
let remoteStream;
let peerConnection;
let callRef;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Accéder au média local (caméra et micro)
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
    })
    .catch(error => {
        console.error('Erreur lors de l\'accès au média :', error);
    });

// Ajouter les gestionnaires d'événements
callButton.addEventListener('click', startCall);
hangupButton.addEventListener('click', hangUp);
callInput.addEventListener('change', answerCall);

async function startCall() {
    callButton.disabled = true;
    hangupButton.disabled = false;

    // Créer une nouvelle référence d'appel dans la base de données
    callRef = push(ref(database, 'calls'));
    // callRef.push(ref(database, 'calls'));
    callInput.value = callRef.key;

    // Créer une nouvelle connexion pair à pair
    peerConnection = new RTCPeerConnection(servers);

    // Ajouter les pistes locales à la connexion
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Gérer les pistes entrantes (flux distant)
    remoteStream = new MediaStream();
    peerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
        remoteVideo.srcObject = remoteStream;
    };

    // Échanger les ICE candidates locales
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const json = event.candidate.toJSON();
            push(ref(database, `calls/${callRef.key}/offerCandidates`), json);
        }
    };

    // Créer une offre SDP
    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    // Envoyer l'offre dans la base de données
    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };
    await set(callRef, { offer });

    // Écouter les réponses (answer)
    onValue(ref(database, `calls/${callRef.key}/answer`), async snapshot => {
        const data = snapshot.val();
        if (data && !peerConnection.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data);
            await peerConnection.setRemoteDescription(answerDescription);
        }
    });

    // Écouter les ICE candidates distantes
    onValue(ref(database, `calls/${callRef.key}/answerCandidates`), snapshot => {
        snapshot.forEach(childSnapshot => {
            const data = childSnapshot.val();
            peerConnection.addIceCandidate(new RTCIceCandidate(data));
        });
    });
}

async function answerCall() {
    callButton.disabled = true;
    hangupButton.disabled = false;

    const callId = callInput.value;
    callRef = ref(database, `calls/${callId}`);

    const callSnapshot = await get(callRef);
    const callData = callSnapshot.val();

    if (!callData) {
        alert('Appel introuvable');
        return;
    }

    // Créer une nouvelle connexion pair à pair
    peerConnection = new RTCPeerConnection(servers);

    // Ajouter les pistes locales à la connexion
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Gérer les pistes entrantes (flux distant)
    remoteStream = new MediaStream();
    peerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
        remoteVideo.srcObject = remoteStream;
    };

    // Échanger les ICE candidates locales
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const json = event.candidate.toJSON();
            push(ref(database, `calls/${callId}/answerCandidates`), json);
        }
    };

    // Obtenir l'offre de l'appelant
    const offerDescription = callData.offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Créer une réponse SDP
    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };
    await update(callRef, { answer });

    // Écouter les ICE candidates de l'offre
    onValue(ref(database, `calls/${callId}/offerCandidates`), snapshot => {
        snapshot.forEach(childSnapshot => {
            const data = childSnapshot.val();
            peerConnection.addIceCandidate(new RTCIceCandidate(data));
        });
    });
}

async function hangUp() {
    if (peerConnection) {
        peerConnection.close();
    }

    if (callRef) {
        await remove(callRef);
    }

    callInput.value = '';
    callButton.disabled = false;
    hangupButton.disabled = true;
    console.log('Appel terminé');
}
