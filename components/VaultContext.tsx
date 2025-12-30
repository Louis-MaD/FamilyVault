'use client';
import React, { createContext, useContext, useState, PropsWithChildren } from 'react';
import { deriveVaultKey, DerivedKey } from '@/lib/crypto.client';

interface VaultContextType {
  isUnlocked: boolean;
  vaultKey: DerivedKey | null;
  unlockVault: (password: string, salt: string) => Promise<boolean>;
  lockVault: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: PropsWithChildren) {
  const [vaultKey, setVaultKey] = useState<DerivedKey | null>(null);

  const unlockVault = async (password: string, salt: string) => {
    try {
      const key = await deriveVaultKey(password, salt);
      setVaultKey(key);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const lockVault = () => setVaultKey(null);

  return (
    <VaultContext.Provider value={{ isUnlocked: !!vaultKey, vaultKey, unlockVault, lockVault }}>
      {children}
    </VaultContext.Provider>
  );
}

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
};