import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '@/pages/Home';
import { Register } from '@/pages/Register';
import { Login } from '@/pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        {/* Placeholder for dashboard setup after registration */}
        <Route
          path="/dashboard/setup"
          element={
            <div className="min-h-screen bg-surface flex items-center justify-center text-on-surface">
              <div className="text-center space-y-4 p-8 max-w-md bg-surface-container-lowest rounded-2xl shadow-xl shadow-surface-container/60 border border-outline-variant/30">
                <div className="size-16 mx-auto rounded-2xl bg-primary text-on-primary flex items-center justify-center text-3xl shadow-md">
                  🚀
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Setting up your workspace…</h1>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Connecting to Meta Embedded Signup. This is where the WhatsApp gateway setup flow will live.
                </p>
              </div>
            </div>
          }
        />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;