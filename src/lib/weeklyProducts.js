import { supabase } from './supabase';
export const moneyCLP = value => value == null ? 'Sin precio' : new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
export async function loadWeeklyProducts() {
  const {data,error} = await supabase.rpc('keloke_weekly_selection');
  if(error) throw error;
  return data;
}
export function safeProductUrl(value){ try {const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;} }
