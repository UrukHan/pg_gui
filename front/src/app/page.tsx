'use client';

import { useState, useEffect } from 'react';
import {
  Box, Paper, TextField, Button, Typography, CircularProgress,
  BottomNavigation, BottomNavigationAction, AppBar, Toolbar, IconButton, Menu, MenuItem,
  useMediaQuery, useTheme,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import Image from 'next/image';
import StorageIcon from '@mui/icons-material/Storage';
import { useAuth } from '@/context/AuthContext';
import { getDiskUsage } from '@/api';
import InstrumentsTab from '@/components/InstrumentsTab';
import ExperimentsTab from '@/components/ExperimentsTab';
import UsersTab from '@/components/UsersTab';

export default function Home() {
  const { user, loading, login, logout } = useAuth();
  const [tab, setTab] = useState(0);
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Disk usage polling
  const [disk, setDisk] = useState<{ used_pct: number; free_bytes: number } | null>(null);
  useEffect(() => {
    if (!user) return;
    const fetch = () => { getDiskUsage().then((r) => setDisk(r.data)).catch(() => {}); };
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, [user]);
  const diskColor = disk ? (disk.used_pct > 90 ? '#f44336' : disk.used_pct > 75 ? '#ff9800' : '#4caf50') : '#888';
  const diskFreeGB = disk ? (disk.free_bytes / 1073741824).toFixed(1) : '?';

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      await login(loginForm.login, loginForm.password);
    } catch (e: any) {
      setLoginError(e.response?.data?.error || 'Ошибка авторизации');
    } finally {
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // --- Login screen ---
  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', bgcolor: '#1a1a2e' }}>
        <Paper sx={{ p: 4, maxWidth: 400, width: '100%', mx: 2, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Image src="/images/logo_dark.png" alt="Ariadna" width={220} height={60} style={{ objectFit: 'contain' }} />
          </Box>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Вход в систему
          </Typography>
          <TextField
            label="Логин"
            fullWidth
            sx={{ mb: 2 }}
            value={loginForm.login}
            onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <TextField
            label="Пароль"
            type="password"
            fullWidth
            sx={{ mb: 2 }}
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {loginError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {loginError}
            </Typography>
          )}
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleLogin}
            disabled={loginLoading}
            sx={{ bgcolor: '#7c4dff', '&:hover': { bgcolor: '#651fff' } }}
          >
            {loginLoading ? <CircularProgress size={24} /> : 'Войти'}
          </Button>
        </Paper>
      </Box>
    );
  }

  // --- Main app ---
  const tabs = [
    { label: 'Приборы', icon: <ScienceIcon /> },
    { label: 'Запуски', icon: <ListAltIcon /> },
    { label: 'Пользователи', icon: <PeopleIcon /> },
  ];

  const tabContent = (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1, md: 2 } }}>
      {tab === 0 && <InstrumentsTab />}
      {tab === 1 && <ExperimentsTab />}
      {tab === 2 && <UsersTab />}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Header */}
      <AppBar position="static" sx={{ bgcolor: '#1a1a2e' }}>
        <Toolbar variant="dense">
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Image src="/images/logo.png" alt="Ariadna" width={150} height={36} style={{ objectFit: 'contain' }} />
          </Box>

          {/* Desktop tabs */}
          {!isMobile && tabs.map((t, i) => (
            <Button
              key={i}
              startIcon={t.icon}
              onClick={() => setTab(i)}
              sx={{
                color: tab === i ? '#b39ddb' : '#ffffff99',
                borderBottom: tab === i ? '2px solid #7c4dff' : 'none',
                borderRadius: 0,
                mx: 0.5,
                textTransform: 'none',
              }}
            >
              {t.label}
            </Button>
          ))}

          {/* Disk usage indicator */}
          {disk && (
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, px: 1, py: 0.25, borderRadius: 1, bgcolor: diskColor + '22', border: `1px solid ${diskColor}55` }}>
              <StorageIcon sx={{ fontSize: 16, color: diskColor, mr: 0.5 }} />
              <Typography variant="caption" sx={{ color: diskColor, fontWeight: 600, lineHeight: 1 }}>
                {disk.used_pct}%
              </Typography>
              <Typography variant="caption" sx={{ color: '#fff9', ml: 0.5, fontSize: '0.65rem', lineHeight: 1 }}>
                {diskFreeGB}GB св.
              </Typography>
            </Box>
          )}

          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <PersonIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem disabled>
              {user.first_name} {user.last_name} ({user.role})
            </MenuItem>
            <MenuItem onClick={() => { setAnchorEl(null); logout(); }}>
              <LogoutIcon sx={{ mr: 1 }} /> Выйти
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Content */}
      {tabContent}

      {/* Mobile bottom navigation */}
      {isMobile && (
        <BottomNavigation
          value={tab}
          onChange={(_, v) => setTab(v)}
          showLabels
          sx={{
            bgcolor: '#1a1a2e',
            flexShrink: 0,
            '& .MuiBottomNavigationAction-root': { color: '#ffffff80' },
            '& .Mui-selected': { color: '#b39ddb !important' },
          }}
        >
          {tabs.map((t, i) => (
            <BottomNavigationAction key={i} label={t.label} icon={t.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}
