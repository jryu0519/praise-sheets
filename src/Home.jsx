import Charts from './Charts'

function Home({ currentUserId, canManage }) {
  return (
    <div>
      <h1>Pri Music Sheetlist</h1>
      <Charts currentUserId={currentUserId} canManage={canManage} />
    </div>
  )
}

export default Home
