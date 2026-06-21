import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { firebaseAdminLogin } from '../../lib/firebaseAuth';
import { ArrowRight, Mail, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true); setError('');
    try {
      const result = await firebaseAdminLogin(email, password);
      login(result.token, result.user);
      navigate('/admin/dashboard');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Glowing backdrop blobs */}
      <div style={{
        position: 'absolute', top: '20%', left: '25%', width: '350px', height: '350px',
        background: 'radial-gradient(circle, rgba(26, 115, 232, 0.08) 0%, transparent 70%)',
        borderRadius: '50%', filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '25%', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(52, 168, 83, 0.06) 0%, transparent 70%)',
        borderRadius: '50%', filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none'
      }} />

      <div className="login-card admin-card-glass admin-animate-fade-in" style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(26, 115, 232, 0.15)',
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        borderRadius: '24px',
        zIndex: 1,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'rgba(26, 115, 232, 0.08)',
            border: '1.5px solid rgba(26, 115, 232, 0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <ShieldAlert size={32} color="var(--accent)" />
          </div>
        </div>

        <h1 className="login-title" style={{ color: 'var(--navy)', fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '6px', letterSpacing: '-0.02em' }}>Admin Portal</h1>
        <p className="login-sub" style={{ color: 'var(--muted)', textAlign: 'center', fontSize: '14px', marginBottom: '32px' }}>Sign in to the administrative dashboard</p>

        {error && (
          <div className="login-error" style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.12)',
            color: 'var(--danger)',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '20px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <label className="login-label" style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '13px', marginBottom: '8px', display: 'block' }}>Admin Email</label>
          <div className="login-input-group admin-input-premium" style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            paddingLeft: '12px',
            display: 'flex',
            alignItems: 'center',
            height: '48px',
            borderRadius: '12px',
            marginBottom: '20px'
          }}>
            <Mail size={18} style={{ marginRight: '10px', color: 'var(--placeholder)', flexShrink: 0 }} />
            <input className="login-input" type="email" placeholder="admin@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus style={{ paddingLeft: 0, color: 'var(--foreground)', background: 'transparent', border: 'none', width: '100%', outline: 'none' }} />
          </div>

          <label className="login-label" style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '13px', marginTop: '16px', marginBottom: '8px', display: 'block' }}>Password</label>
          <div className="login-input-group admin-input-premium" style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            paddingLeft: '12px',
            display: 'flex',
            alignItems: 'center',
            height: '48px',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <Lock size={18} style={{ marginRight: '10px', color: 'var(--placeholder)', flexShrink: 0 }} />
            <input className="login-input" type={showPassword ? 'text' : 'password'}
              placeholder="Enter admin password"
              value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingLeft: 0, color: 'var(--foreground)', background: 'transparent', border: 'none', width: '100%', outline: 'none' }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                color: 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}
              tabIndex={-1}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button type="submit" className="login-btn" disabled={loading}
            style={{
              marginTop: '24px',
              background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
              boxShadow: '0 8px 20px rgba(0, 45, 93, 0.15)',
              border: 'none',
              cursor: 'pointer',
              height: '48px',
              borderRadius: '12px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: '#ffffff',
              fontWeight: 700,
              transition: 'all 0.2s ease'
            }}>
            {loading ? <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <><span>Secure Login</span><ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="login-devnote" style={{ marginTop: '24px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
          This area is restricted to authorized administrators only.
        </p>
      </div>
    </div>
  );
}
