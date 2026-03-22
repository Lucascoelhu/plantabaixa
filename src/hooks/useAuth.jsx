import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined)
  const [userDoc, setUserDoc]           = useState(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) await syncUserDoc(fbUser)
      else setUserDoc(null)
      setLoading(false)
    })
    return unsub
  }, [])

  async function syncUserDoc(fbUser) {
    const ref  = doc(db, 'users', fbUser.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      const data = {
        uid: fbUser.uid, email: fbUser.email,
        name: fbUser.displayName || '', photoURL: fbUser.photoURL || '',
        plan: 'free', stripeCustomerId: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }
      await setDoc(ref, data)
      setUserDoc(data)
    } else {
      setUserDoc(snap.data())
    }
  }

  async function refreshUserDoc() {
    if (!firebaseUser) return
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
    if (snap.exists()) setUserDoc(snap.data())
  }

  async function loginWithGoogle()                    { const r = await signInWithPopup(auth, googleProvider); return r.user }
  async function loginWithEmail(email, password)      { const r = await signInWithEmailAndPassword(auth, email, password); return r.user }
  async function registerWithEmail(name, email, pass) {
    const r = await createUserWithEmailAndPassword(auth, email, pass)
    await updateProfile(r.user, { displayName: name })
    return r.user
  }
  async function logout()             { await signOut(auth); setUserDoc(null) }
  async function resetPassword(email) { await sendPasswordResetEmail(auth, email) }

  return (
    <AuthContext.Provider value={{
      firebaseUser, user: userDoc, loading,
      loginWithGoogle, loginWithEmail, registerWithEmail,
      logout, resetPassword, refreshUserDoc,
      isPro: userDoc?.plan === 'pro',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
