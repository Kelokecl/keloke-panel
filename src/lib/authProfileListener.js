// Supabase holds its auth lock while notifying listeners. Database/auth calls
// must run after the listener returns, otherwise requests can deadlock.
export function subscribeProfileAuth(auth, { fetchProfile, setProfile, signOut, onError = console.error }) {
  let active = true;
  let generation = 0;
  const timers = new Set();
  const { data } = auth.onAuthStateChange((event, session) => {
    if (!["SIGNED_IN", "USER_UPDATED", "TOKEN_REFRESHED", "SIGNED_OUT"].includes(event)) return;
    const current = ++generation;
    if (event === "SIGNED_OUT" || !session?.user?.email) {
      setProfile(null);
      return;
    }
    const timer = setTimeout(async () => {
      timers.delete(timer);
      if (!active || current !== generation) return;
      try {
        const profile = await fetchProfile(session.user.email);
        if (!active || current !== generation) return;
        if (!profile) {
          setProfile(null);
          await signOut();
          return;
        }
        setProfile(profile);
      } catch (error) {
        if (active && current === generation) onError(error);
      }
    }, 0);
    timers.add(timer);
  });
  return () => {
    active = false;
    generation++;
    timers.forEach(clearTimeout);
    data?.subscription?.unsubscribe?.();
  };
}
