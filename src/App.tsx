import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { RecorderProvider, useRecorder } from './RecorderContext'
import RecordPage from './pages/RecordPage'
import HistoryPage from './pages/HistoryPage'
import RunDetailPage from './pages/RunDetailPage'
import MorePage from './pages/MorePage'

function TabBar() {
  const { status } = useRecorder()
  return (
    <nav className="tabbar">
      <NavLink to="/" end>
        <span className="tab-ico">{status === 'recording' ? '●' : status === 'paused' ? '❚❚' : '▶'}</span>
        <span>Record</span>
      </NavLink>
      <NavLink to="/history">
        <span className="tab-ico">☰</span>
        <span>History</span>
      </NavLink>
      <NavLink to="/more">
        <span className="tab-ico">⚙</span>
        <span>More</span>
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <RecorderProvider>
        <main className="app">
          <Routes>
            <Route path="/" element={<RecordPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/run/:id" element={<RunDetailPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="*" element={<RecordPage />} />
          </Routes>
        </main>
        <TabBar />
      </RecorderProvider>
    </HashRouter>
  )
}
