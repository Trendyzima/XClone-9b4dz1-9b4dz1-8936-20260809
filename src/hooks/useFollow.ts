import { useState } from 'react';
import * as federation from '@/api/federation';

export function useFollow() {
  const [state, setState] = useState<'not' | 'pending' | 'following' | 'error'>('not');

  async function follow(acct: string) {
    try {
      setState('pending');
      await federation.follow(acct);
      // Optimistic; final state should be confirmed by notifications/realtime
      setState('following');
    } catch (err) {
      setState('error');
      throw err;
    }
  }

  return { state, follow, setState };
}
