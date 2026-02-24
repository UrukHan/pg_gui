'use client';

import { useState, ComponentType } from 'react';
import {
  Box, Paper, TextField, Button, Typography, CircularProgress,
  BottomNavigation, BottomNavigationAction, AppBar, Toolbar, IconButton, Menu, MenuItem,
  useMediaQuery, useTheme,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import TableChartIcon from '@mui/icons-material/TableChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import InstrumentsTab from '@/components/InstrumentsTab';
import TablesTab from '@/components/TablesTab';

const GraphsTab = dynamic<{ experimentId: number | null }>(
  () => import('@/components/GraphsTab') as Promise<{ default: ComponentType<{ experimentId: number | null }> }>,
  { ssr: false }
);

export default function Home() {
  const { user, loading, login, logout } = useAuth();
  const [tab, setTab] = useState(0);
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  // For graphs tab: which experiment to show
  const [graphExperimentId, setGraphExperimentId] = useState<number | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

  const openGraphs = (experimentId: number) => {
    setGraphExperimentId(experimentId);
    setTab(2);
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
            <Image src="/images/logo.png" alt="Ariadna" width={220} height={60} style={{ objectFit: 'contain' }} />
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
    { label: 'Таблицы', icon: <TableChartIcon /> },
    { label: 'Статистика', icon: <BarChartIcon /> },
  ];

  const tabContent = (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1, md: 2 } }}>
      {tab === 0 && <InstrumentsTab />}
      {tab === 1 && <TablesTab onOpenGraphs={openGraphs} />}
      {tab === 2 && <GraphsTab experimentId={graphExperimentId} />}
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
          sx={{ borderTop: '1px solid #e0e0e0', flexShrink: 0 }}
        >
          {tabs.map((t, i) => (
            <BottomNavigationAction key={i} label={t.label} icon={t.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}
