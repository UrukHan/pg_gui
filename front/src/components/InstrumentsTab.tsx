'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Chip, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, CircularProgress, Divider, Card, CardContent, Stack,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { useAuth } from '@/context/AuthContext';
import {
  listInstruments, toggleInstrument, pingInstrument,
  startExperiment, stopExperiment, listExperiments, getExperimentStatus,
} from '@/api';
import type { Instrument, Experiment } from '@/types';

export default function InstrumentsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasInstrumentAccess = user?.instrument_access || isAdmin;

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Experiment start
  const [expName, setExpName] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState<number[]>([]);

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

  // Poll running experiment status
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
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Running experiment banner */}
      {runningExp && (
        <Card sx={{ mb: 2, border: '2px solid #4caf50', bgcolor: '#e8f5e9' }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" color="success.main">
                  Эксперимент: {runningExp.name}
                </Typography>
                <Typography variant="body2">
                  Измерений: {measurementCount}
                  {polling && <Chip label="Сбор данных" color="success" size="small" sx={{ ml: 1 }} />}
                </Typography>
              </Box>
              <Button
                variant="contained"
                color="error"
                startIcon={<StopIcon />}
                onClick={handleStop}
                size="large"
              >
                Остановить
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Start experiment form */}
      {!runningExp && hasInstrumentAccess && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>Запуск эксперимента</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Название эксперимента"
              value={expName}
              onChange={(e) => setExpName(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Заметки"
              value={expNotes}
              onChange={(e) => setExpNotes(e.target.value)}
              fullWidth
              size="small"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Выберите приборы:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {instruments.filter((i) => i.active && i.online).map((inst) => (
              <Chip
                key={inst.id}
                label={`${inst.model || inst.name} (${inst.host}:${inst.port})`}
                color={selectedInstruments.includes(inst.id) ? 'primary' : 'default'}
                onClick={() => toggleInstrumentSelection(inst.id)}
                variant={selectedInstruments.includes(inst.id) ? 'filled' : 'outlined'}
              />
            ))}
            {instruments.filter((i) => i.active && i.online).length === 0 && (
              <Typography variant="body2" color="text.secondary">Нет доступных приборов</Typography>
            )}
          </Box>
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            onClick={handleStart}
            disabled={!expName.trim() || selectedInstruments.length === 0}
            size="large"
          >
            Запустить измерение
          </Button>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Instruments table */}
      <Typography variant="h6" sx={{ mb: 1 }}>Приборы</Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Модель</TableCell>
              <TableCell>Прошивка</TableCell>
              <TableCell>Адрес</TableCell>
              <TableCell>Связь</TableCell>
              <TableCell align="center">Вкл/Выкл</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {instruments.map((inst) => (
              <TableRow key={inst.id} onClick={() => handlePing(inst.id)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f5f5f5' } }}>
                <TableCell sx={{ fontWeight: 600 }}>{inst.model || inst.name}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {inst.firmware || '—'}
                  {inst.serial ? ` (${inst.serial})` : ''}
                </TableCell>
                <TableCell>{inst.host}:{inst.port}</TableCell>
                <TableCell>
                  <Chip
                    label={inst.online ? 'Онлайн' : inst.active ? 'Офлайн' : 'Выкл'}
                    color={inst.online ? 'success' : inst.active ? 'error' : 'default'}
                    size="small"
                    variant={inst.online ? 'filled' : 'outlined'}
                  />
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={inst.active}
                    onChange={() => handleToggle(inst.id)}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
            {instruments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Приборы не настроены. Укажите INSTRUMENTS в docker-compose.yml
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
