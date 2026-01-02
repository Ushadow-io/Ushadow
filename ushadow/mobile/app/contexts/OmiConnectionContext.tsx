/**
 * OMI Connection Context
 *
 * Provides a singleton OmiConnection instance to the entire app.
 * This ensures connection state persists when components mount/unmount.
 */

import React, { createContext, useContext, useRef } from 'react';
import { OmiConnection } from 'friend-lite-react-native';

interface OmiConnectionContextType {
  omiConnection: OmiConnection;
}

const OmiConnectionContext = createContext<OmiConnectionContextType | null>(null);

// Singleton OmiConnection - created once for the entire app
let globalOmiConnection: OmiConnection | null = null;

const getGlobalOmiConnection = (): OmiConnection => {
  if (!globalOmiConnection) {
    console.log('[OmiConnectionContext] Creating singleton OmiConnection');
    globalOmiConnection = new OmiConnection();
  }
  return globalOmiConnection;
};

export const OmiConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const omiConnectionRef = useRef<OmiConnection>(getGlobalOmiConnection());

  const value: OmiConnectionContextType = {
    omiConnection: omiConnectionRef.current,
  };

  return (
    <OmiConnectionContext.Provider value={value}>
      {children}
    </OmiConnectionContext.Provider>
  );
};

export const useOmiConnection = (): OmiConnection => {
  const context = useContext(OmiConnectionContext);
  if (!context) {
    throw new Error('useOmiConnection must be used within an OmiConnectionProvider');
  }
  return context.omiConnection;
};

export default OmiConnectionContext;
