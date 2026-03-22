import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyB7dJC5GXiS1XL4XZYBwX4ezJO8VOCRq3M",
  authDomain:        "planta-baixa-813cc.firebaseapp.com",
  projectId:         "planta-baixa-813cc",
  storageBucket:     "planta-baixa-813cc.firebasestorage.app",
  messagingSenderId: "294212558031",
  appId:             "1:294212558031:web:c8b6fff1c63c864b512bba",
}

const app = initializeApp(firebaseConfig)

export const auth           = getAuth(app)
export const db             = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
