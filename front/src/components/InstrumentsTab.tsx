'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Chip, Switch, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel,
  Alert, CircularProgress, Divider, Card, CardContent, Stack, IconButton,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '@/context/AuthContext';
import {
  listInstruments, toggleInstrument, pingInstrument,
  startExperiment, stopExperiment, listExperiments, getExperimentStatus,
} from '@/api';
import type { Instrument, Experiment } from '@/types';

const ALL_PARAMS = [
  { key: 'voltage', label: 'Напряжение (В)' },
  { key: 'current', label: 'Ток (А)' },
  { key: 'charge', label: 'Заряд (Кл)' },
  { key: 'resistance', label: 'Сопротивление (Ом)' },
  { key: 'temperature', label: 'Температура (°C)' },
  { key: 'humidity', label: 'Влажность (%)' },
  { key: 'source', label: 'Источник' },
  { key: 'math_value', label: 'Math' },
];

export default function InstrumentsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasInstrumentAccess = user?.instrument_access || isAdmin;

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Experiment start
  const [expName, setExpName] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState<number[]>([]);

  // Measurement params selector
  const [paramsDialogOpen, setParamsDialogOpen] = useState(false);
  const [selectedParams, setSelectedParams] = useState<string[]>(ALL_PARAMS.map((p) => p.key));

  // Running experiment tracking
  const [runningExp, setRunningExp] = useState<Experiment | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  const [polling, setPolling] = useState(false);

  const loadInstruments = useCallback(async () => {
    try {
      const res = await listInstruments();
      setInstruments(res.data);
    } catch {
      setError('Ошибка загрузки приборов');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkRunningExperiment = useCallback(async () => {
    try {
      const res = await listExperiments();
      const running = res.data.find((e) => e.status === 'running');
      if (running) {
        setRunningExp(running);
        const st = await getExperimentStatus(running.id);
        setMeasurementCount(st.data.measurement_count);
        setPolling(st.data.polling_active);
      } else {
        setRunningExp(null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadInstruments();
    checkRunningExperiment();
  }, [loadInstruments, checkRunningExperiment]);

  useEffect(() => {
    if (!runningExp) return;
    const iv = setInterval(async () => {
      try {
        const st = await getExperimentStatus(runningExp.id);
        setMeasurementCount(st.data.measurement_count);
        setPolling(st.data.polling_active);
        if (st.data.experiment.status !== 'running') {
          setRunningExp(null);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [runningExp]);

  const handleToggle = async (id: number) => {
    try {
      await toggleInstrument(id);
      loadInstruments();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка переключения');
    }
  };

  const handlePing = async (id: number) => {
    try {
      const res = await pingInstrument(id);
      setSuccess(`${res.data.model} ${res.data.firmware} — ОК`);
      loadInstruments();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Прибор не отвечает');
    }
  };

  const toggleInstrumentSelection = (id: number) => {
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleParam = (key: string) => {
    setSelectedParams((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleStart = async () => {
    if (!expName.trim()) { setError('Введите название эксперимента'); return; }
    if (selectedInstruments.length === 0) { setError('Выберите хотя бы один прибор'); return; }
    setError('');
    try {
      const res = await startExperiment({
        name: expName,
        instrument_ids: selectedInstruments.join(','),
        notes: expNotes,
      });
      setRunningExp(res.data.experiment);
      setMeasurementCount(0);
      setPolling(true);
      setSuccess('Эксперимент запущен');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка запуска');
    }
  };

  const handleStop = async () => {
    if (!runningExp) return;
    try {
      await stopExperiment(runningExp.id);
      setRunningExp(null);
      setPolling(false);
      setSuccess('Эксперимент остановлен');
      setExpName('');
      setExpNotes('');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка остановки');
    }
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Running experiment banner */}
      {runningExp && (
        <Card sx={{ mb: 2, border: '2px solid #4caf50', bgcolor: '#e8f5e9' }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle1" color="success.main" fontWeight={600}>
                  {runningExp.name}
                </Typography>
                <Typography variant="body2">
                  Измерений: {measurementCount}
                  {polling && <Chip label="Сбор данных" color="success" size="small" sx={{ ml: 1 }} />}
                </Typography>
              </Box>
              <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={handleStop}>
                Стоп
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Start experiment form */}
      {!runningExp && hasInstrumentAccess && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>Запуск эксперимента</Typography>
            <IconButton size="small" onClick={() => setParamsDialogOpen(true)} title="Параметры измерения">
              <SettingsIcon />
            </IconButton>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
            <TextField label="Название" value={expName} onChange={(e) => setExpName(e.target.value)} fullWidth size="small" />
            <TextField label="Заметки" value={expNotes} onChange={(e) => setExpNotes(e.target.value)} fullWidth size="small" />
          </Stack>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
            {instruments.filter((i) => i.active && i.online).map((inst) => (
              <Chip
                key={inst.id}
                label={inst.model || inst.name}
                color={selectedInstruments.includes(inst.id) ? 'primary' : 'default'}
                onClick={() => toggleInstrumentSelection(inst.id)}
                variant={selectedInstruments.includes(inst.id) ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
            {instruments.filter((i) => i.active && i.online).length === 0 && (
              <Typography variant="body2" color="text.secondary">Нет доступных приборов</Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Параметры: {selectedParams.length === ALL_PARAMS.length ? 'Все' : selectedParams.length + ' из ' + ALL_PARAMS.length}
          </Typography>
          <Button
            variant="contained" color="success" startIcon={<PlayArrowIcon />}
            onClick={handleStart} disabled={!expName.trim() || selectedInstruments.length === 0}
          >
            Запустить
          </Button>
        </Paper>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* Instruments list */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Приборы</Typography>

      <Stack spacing={1}>
        {instruments.map((inst) => (
          <Paper key={inst.id} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }}
              onClick={() => setExpandedId(expandedId === inst.id ? null : inst.id)}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight={600} noWrap>
                  {inst.model || inst.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {inst.host}:{inst.port}
                </Typography>
              </Box>
              <Chip
                label={inst.online ? 'Онлайн' : inst.active ? 'Офлайн' : 'Выкл'}
                color={inst.online ? 'success' : inst.active ? 'error' : 'default'}
                size="small"
                variant={inst.online ? 'filled' : 'outlined'}
                sx={{ mx: 1, flexShrink: 0 }}
              />
              <Switch
                checked={inst.active}
                onChange={(e) => { e.stopPropagation(); handleToggle(inst.id); }}
                onClick={(e) => e.stopPropagation()}
                size="small"
                sx={{ flexShrink: 0 }}
              />
              {expandedId === inst.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Box>
            <Collapse in={expandedId === inst.id}>
              <Divider />
              <Box sx={{ px: 2, py: 1, bgcolor: '#f9f9f9' }}>
                <Stack direction="row" spacing={3} flexWrap="wrap">
                  <Box>
                    <Typography variant="caption" color="text.secondary">Модель</Typography>
                    <Typography variant="body2" fontWeight={500}>{inst.model || '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Прошивка</Typography>
                    <Typography variant="body2" fontWeight={500}>{inst.firmware || '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Серийный №</Typography>
                    <Typography variant="body2" fontWeight={500}>{inst.serial || '—'}</Typography>
                  </Box>
                </Stack>
                <Button size="small" onClick={() => handlePing(inst.id)} sx={{ mt: 1 }}>
                  Проверить связь
                </Button>
              </Box>
            </Collapse>
          </Paper>
        ))}
        {instruments.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">Приборы не настроены. Укажите INSTRUMENTS в docker-compose.yml</Typography>
          </Paper>
        )}
      </Stack>

      {/* Params selector dialog */}
      <Dialog open={paramsDialogOpen} onClose={() => setParamsDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Параметры измерения</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedParams.length === ALL_PARAMS.length}
                indeterminate={selectedParams.length > 0 && selectedParams.length < ALL_PARAMS.length}
                onChange={() => setSelectedParams(selectedParams.length === ALL_PARAMS.length ? [] : ALL_PARAMS.map((p) => p.key))}
              />
            }
            label="Выбрать все"
          />
          <Divider sx={{ my: 1 }} />
          {ALL_PARAMS.map((p) => (
            <FormControlLabel
              key={p.key}
              control={<Checkbox checked={selectedParams.includes(p.key)} onChange={() => toggleParam(p.key)} size="small" />}
              label={p.label}
              sx={{ display: 'block' }}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParamsDialogOpen(false)} variant="contained" size="small">Готово</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
