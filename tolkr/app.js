// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
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
        { urls: 'stun:stun.l.google.com:19302' } // Serveur STUN public de Google
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

// Fonction pour démarrer l'appel
callButton.onclick = async () => {
    // Désactiver le bouton d'appel
    callButton.disabled = true;
    hangupButton.disabled = false;

    // Créer une nouvelle référence d'appel dans la base de données
    callRef = database.ref('calls').push();
    callInput.value = callRef.key; // Afficher l'ID de l'appel

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
            callRef.child('offerCandidates').push(json);
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
    await callRef.set({ offer });

    // Écouter les réponses (answer)
    callRef.child('answer').on('value', async snapshot => {
        const data = snapshot.val();
        if (data && !peerConnection.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data);
            await peerConnection.setRemoteDescription(answerDescription);
        }
    });

    // Écouter les ICE candidates distantes
    callRef.child('answerCandidates').on('child_added', snapshot => {
        const data = snapshot.val();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
    });
};

// Fonction pour répondre à un appel existant
callInput.onchange = async () => {
    // Désactiver le bouton d'appel
    callButton.disabled = true;
    hangupButton.disabled = false;

    // Obtenir la référence de l'appel existant
    const callId = callInput.value;
    callRef = database.ref('calls/' + callId);

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
            callRef.child('answerCandidates').push(json);
        }
    };

    // Obtenir l'offre de l'appelant
    const callData = (await callRef.get()).val();
    const offerDescription = callData.offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Créer une réponse SDP
    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };
    await callRef.update({ answer });

    // Écouter les ICE candidates de l'offre
    callRef.child('offerCandidates').on('child_added', snapshot => {
        const data = snapshot.val();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
    });
};

// Fonction pour raccrocher l'appel
hangupButton.onclick = async () => {
    peerConnection.close();

    // Supprimer les données de l'appel de la base de données
    if (callRef) {
        await callRef.remove();
    }

    // Réinitialiser l'interface
    callInput.value = '';
    callButton.disabled = false;
    hangupButton.disabled = true;
    console.log('Appel terminé');
};
