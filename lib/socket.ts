'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // ponytail: connect to whatever origin the page was served from. Hardcoding
    // NEXT_PUBLIC_SITE_URL sent every phone/LAN visitor's socket to its own localhost,
    // so realtime silently died there and the UI only updated on a manual refresh.
    socketInstance = io({
      path: '/socket.io',
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const sock = getSocket();
    setSocket(sock);

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);

    if (sock.connected) {
      setIsConnected(true);
    }

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, isConnected };
}
