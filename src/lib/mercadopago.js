import { getFunctions, httpsCallable } from 'firebase/functions';

export async function createCheckoutSession(uid, email) {
  const functions = getFunctions();
  const createSession = httpsCallable(functions, 'createCheckoutSession');
  
  const { data } = await createSession({ 
    uid, 
    email,
    successUrl: `${window.location.origin}/app?checkout=success`,
    cancelUrl: `${window.location.origin}/pricing`
  });
  
  if (data?.init_point) {
    window.location.href = data.init_point; // Mercado Pago
  } else {
    throw new Error('Erro ao criar checkout');
  }
  
  return data;
}
