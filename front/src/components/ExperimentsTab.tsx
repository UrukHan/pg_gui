'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, CircularProgress, Chip,
  Typography, Stack, Collapse, Divider, TextField, FormControl,
  InputLabel, Select, MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VideocamIcon from '@mui/icons-material/Videocam';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '@/context/AuthContext';
import {
  listExperiments, deleteExperiment, getExperimentVideoUrl, listUsers,
} from '@/api';
import type { Experiment, User } from '@/types';
import dynamic from 'next/dynamic';

const GraphsTab = dynamic(() => import('@/components/GraphsTab'), { ssr: false });

export default function ExperimentsTab() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const canDelete = isAdmin || currentUser?.permission === 'read_write_all';

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Filters
  const [filterUser, setFilterUser] = useState<number | ''>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Detail view: which experiment to show
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [expRes, usrRes] = await Promise.all([listExperiments(), listUsers()]);
      setExperiments(expRes.data);
      setUsers(usrRes.data);
    } catch {
      setError('Ошибка загрузки экспериментов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered experiments
  const filtered = experiments.filter((exp) => {
    if (filterUser && exp.user_id !== filterUser) return false;
    if (filterFrom && exp.start_time && new Date(exp.start_time) < new Date(filterFrom)) return false;
    if (filterTo && exp.start_time && new Date(exp.start_time) > new Date(filterTo + 'T23:59:59')) return false;
    return true;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить эксперимент и все его данные?')) return;
    try {
      await deleteExperiment(id);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'running': return 'success';
      case 'completed': return 'info';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'running': return 'Запущен';
      case 'completed': return 'Завершён';
      case 'stopped': return 'Остановлен';
      case 'error': return 'Ошибка';
      default: return s;
    }
  };

  const fmtDateLine1 = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('ru-RU'); } catch { return '—'; }
  };
  const fmtTimeLine2 = (s: string | null) => {
    if (!s) return '';
    try { return new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };

  if (loading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;

  // Detail view — show GraphsTab for selected experiment
  if (detailId !== null) {
    const exp = experiments.find((e) => e.id === detailId);
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => setDetailId(null)}
          sx={{ mb: 1, textTransform: 'none' }}
        >
          Назад к запускам
        </Button>
        {exp && (
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            {exp.name}
            <Chip
              label={statusLabel(exp.status)}
              color={statusColor(exp.status) as any}
              size="small"
              sx={{ ml: 1, verticalAlign: 'middle' }}
            />
          </Typography>
        )}
        <GraphsTab experimentId={detailId} />
      </Box>
    );
  }

  // List view
  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 1, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Пользователь</InputLabel>
            <Select value={filterUser} label="Пользователь" onChange={(e) => setFilterUser(e.target.value as number | '')}>
              <MenuItem value="">Все</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="С даты" type="date" size="small"
            value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 140 }}
          />
          <TextField
            label="По дату" type="date" size="small"
            value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 140 }}
          />
          {(filterUser || filterFrom || filterTo) && (
            <Button size="small" onClick={() => { setFilterUser(''); setFilterFrom(''); setFilterTo(''); }}>Сбросить</Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {filtered.length} из {experiments.length}
          </Typography>
        </Stack>
      </Paper>

      <Stack spacing={1}>
        {filtered.map((exp) => (
          <Paper key={exp.id} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }}
              onClick={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
            >
              {/* Date + time */}
              <Box sx={{ minWidth: 65, flexShrink: 0, mr: 1.5 }}>
                <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
                  {fmtDateLine1(exp.start_time)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtTimeLine2(exp.start_time)}
                </Typography>
              </Box>

              {/* Name + author */}
              <Box sx={{ flexGrow: 1, minWidth: 0, mr: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{exp.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {exp.user ? `${exp.user.first_name} ${exp.user.last_name}` : `ID ${exp.user_id}`}
                </Typography>
              </Box>

              {/* Status */}
              <Chip
                label={statusLabel(exp.status)}
                color={statusColor(exp.status) as any}
                size="small"
                sx={{ flexShrink: 0, mr: 0.5 }}
              />

              {/* Actions */}
              {exp.video_path && (
                <IconButton size="small" title="Видео" onClick={(e) => { e.stopPropagation(); setVideoUrl(getExperimentVideoUrl(exp.id)); }}>
                  <VideocamIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton size="small" title="Детали" onClick={(e) => { e.stopPropagation(); setDetailId(exp.id); }}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
              {canDelete && (
                <IconButton size="small" title="Удалить" onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
              {expandedId === exp.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Box>

            <Collapse in={expandedId === exp.id}>
              <Divider />
              <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9f9f9' }}>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Начало</Typography>
                    <Typography variant="body2">
                      {exp.start_time ? `${fmtDateLine1(exp.start_time)} ${fmtTimeLine2(exp.start_time)}` : '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Окончание</Typography>
                    <Typography variant="body2">
                      {exp.end_time ? `${fmtDateLine1(exp.end_time)} ${fmtTimeLine2(exp.end_time)}` : '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Длительность</Typography>
                    <Typography variant="body2">
                      {exp.start_time && exp.end_time
                        ? (() => {
                            const ms = new Date(exp.end_time).getTime() - new Date(exp.start_time).getTime();
                            const s = Math.floor(ms / 1000);
                            if (s < 60) return `${s} сек`;
                            const m = Math.floor(s / 60);
                            if (m < 60) return `${m} мин ${s % 60} сек`;
                            return `${Math.floor(m / 60)} ч ${m % 60} мин`;
                          })()
                        : exp.start_time ? 'идёт...' : '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Приборы</Typography>
                    <Typography variant="body2">{exp.instrument_ids || '—'}</Typography>
                  </Box>
                  {exp.notes && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Заметки</Typography>
                      <Typography variant="body2">{exp.notes}</Typography>
                    </Box>
                  )}
                </Stack>
              </Box>
            </Collapse>
          </Paper>
        ))}
        {filtered.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {experiments.length === 0 ? 'Нет экспериментов' : 'Нет экспериментов по заданным фильтрам'}
            </Typography>
          </Paper>
        )}
      </Stack>

      {/* Video player dialog */}
      <Dialog open={!!videoUrl} onClose={() => setVideoUrl(null)} maxWidth="md" fullWidth>
        <DialogTitle>Видеозапись</DialogTitle>
        <DialogContent sx={{ p: 1 }}>
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '70vh', borderRadius: 4 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVideoUrl(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
