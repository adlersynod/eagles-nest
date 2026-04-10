function App() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#e8e8e8',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '3.5rem', marginBottom: '0.5rem', fontWeight: 700 }}>
        🦅 Eagles-Nest
      </h1>
      <p style={{ fontSize: '1.25rem', opacity: 0.8, marginBottom: '2rem' }}>
        RV Lifestyle & Destination Planner
      </p>
      <div style={{ 
        padding: '2rem 3rem', 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <p style={{ fontSize: '1.1rem' }}>
          The <strong>Adler Synod</strong> is initializing...
        </p>
        <p style={{ fontSize: '0.9rem', opacity: 0.6, marginTop: '1rem' }}>
          Ready for deployment. 🚐💨
        </p>
      </div>
    </div>
  )
}

export default App
