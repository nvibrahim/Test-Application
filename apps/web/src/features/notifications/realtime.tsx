'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_PATH } from '@inspower/shared';

/**
 * One Socket.IO connection per tab, on the web app's own origin. Any event for this person or
 * the organization refreshes the server components, so open screens follow changes. A session
 * revoked elsewhere disconnects the socket; the next navigation sends the person to sign-in.
 */
export function RealtimeRefresher() {
  const router = useRouter();
  useEffect(() => {
    const socket = io({
      path: `${API_BASE_PATH}/realtime`,
      addTrailingSlash: false,
      withCredentials: true,
      // Long-polling first: a WebSocket upgrade does not pass through the web app's own proxy
      // (local development, browser tests); behind Caddy the connection upgrades afterwards.
      transports: ['polling', 'websocket'],
      reconnectionDelayMax: 30_000,
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    socket.on('event', () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 300);
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') router.refresh();
    });
    return () => {
      if (timer) clearTimeout(timer);
      socket.close();
    };
  }, [router]);
  return null;
}
