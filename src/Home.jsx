import Charts from './Charts'

function Home({ currentUserId, canManage, isHost }) {
  return <Charts currentUserId={currentUserId} canManage={canManage} isHost={isHost} />
}

export default Home
