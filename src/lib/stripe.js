import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

export async function createCheckoutSession(uid, email) {
  const createSession = httpsCallable(functions, 'createCheckoutSession');
  
  const { data } = await createSession({ 
    uid, 
    email,
    successUrl: `${window.location.origin}/app?checkout=success`,
    cancelUrl: `${window.location.origin}/pricing`
  });
  
  // Redireciona para o checkout do Stripe
  if (data?.url) {
    window.location.href = data.url;
  } else {
    throw new Error('Erro ao criar sessão de checkout');
  }
  
  return data;
}
