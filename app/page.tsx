import { getSession } from '@/lib/auth';
import Link from 'next/link';

export default async function Home() {
  const session = await getSession();

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-6">Family Vault</h1>
        <p className="text-xl text-gray-400 mb-8">
          Local-only, zero-knowledge encrypted storage for your family secrets.
        </p>
        
        <div className="flex gap-4">
          {!session ? (
            <>
              <Link href="/login" className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-500">
                Login
              </Link>
              <Link href="/signup" className="bg-gray-700 px-6 py-3 rounded-lg font-bold hover:bg-gray-600">
                Signup
              </Link>
            </>
          ) : (
             <Link href="/vault" className="bg-green-600 px-6 py-3 rounded-lg font-bold hover:bg-green-500">
                Open Vault
              </Link>
          )}
        </div>
      </div>
    </main>
  );
}