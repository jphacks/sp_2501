import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function Home() {
  const { data: session, status } = useSession()
  if (status === 'loading') {
    return <div>Loading...</div>
  }

  if (!session) {
    return (
      <div>
        <h1>You are not signed in</h1>
        <Link href="/login">Sign in</Link>
      </div>
    )
  }
  return (
    <div>
      <h1>Welcome {session.user?.name}</h1>
      <img src={(session.user as any)?.image || ''} alt="avatar" width={96} height={96} />
      <p>{session.user?.email}</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}
