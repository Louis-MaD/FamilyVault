'use client';
import React, { createContext, useContext, useState, PropsWithChildren } from 'react';
import {
  deriveVaultKey,
  DerivedKey,
  generateKeyPair,
  encryptPrivateKey,
} from '@/lib/crypto.client';

interface VaultContextType {
  isUnlocked: boolean;
  vaultKey: DerivedKey | null;
  unlockVault: (password: string, salt: string) => Promise<boolean>;
  lockVault: () => void;
  keypairError: string | null;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: PropsWithChildren) {
  const [vaultKey, setVaultKey] = useState<DerivedKey | null>(null);
  const [keypairError, setKeypairError] = useState<string | null>(null);
  const [keypairChecked, setKeypairChecked] = useState(false);

  const ensureKeypair = async (key: DerivedKey) => {
    if (keypairChecked) return;
    setKeypairChecked(true);
    setKeypairError(null);

    try {
      const res = await fetch('/api/keys/me');
      if (res.status === 401) return;
      if (!res.ok) throw new Error('Failed to check keypair status');

      const data = await res.json();
      if (data.hasKeypair) return;

      const keypair = await generateKeyPair();
      const encryptedPrivateKey = await encryptPrivateKey(keypair.privateKey, key);

      const createRes = await fetch('/api/keys/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: keypair.publicKey,
          encryptedPrivateKey,
        }),
      });

      if (createRes.status === 409) return;
      if (!createRes.ok) {
        throw new Error('Failed to create keypair');
      }
    } catch (_error) {
      setKeypairError('Sharing keys could not be initialized. Try unlocking again.');
    }
  };

  const unlockVault = async (password: string, salt: string) => {
    try {
      const key = await deriveVaultKey(password, salt);
      setVaultKey(key);
      ensureKeypair(key);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const lockVault = () => {
    setVaultKey(null);
    setKeypairError(null);
    setKeypairChecked(false);
  };

  return (
    <VaultContext.Provider
      value={{ isUnlocked: !!vaultKey, vaultKey, unlockVault, lockVault, keypairError }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
};
