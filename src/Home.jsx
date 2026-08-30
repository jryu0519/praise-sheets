import Charts from './Charts'

function Home({ currentUserId, canManage, isHost }) {
  return (
    <div>
      <h1>Pri Music Sheetlist</h1>
      <Charts currentUserId={currentUserId} canManage={canManage} isHost={isHost} />
    </div>
  )
}

export default Home
