'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, TextField, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch,
  Alert, CircularProgress, Divider, Card, CardContent, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NetworkPingIcon from '@mui/icons-material/NetworkPing';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { useAuth } from '@/context/AuthContext';
import {
  listInstruments, createInstrument, updateInstrument, deleteInstrument,
  pingInstrument, startExperiment, stopExperiment, listExperiments,
  getExperimentStatus,
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

  // Instrument dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<Instrument | null>(null);
  const [instForm, setInstForm] = useState({ name: '', host: '', port: 45454, active: true });

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

  const handleSaveInstrument = async () => {
    try {
      if (editingInst) {
        await updateInstrument(editingInst.id, instForm);
        setSuccess('Прибор обновлён');
      } else {
        await createInstrument(instForm);
        setSuccess('Прибор добавлен');
      }
      setDialogOpen(false);
      loadInstruments();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDeleteInstrument = async (id: number) => {
    if (!confirm('Удалить прибор?')) return;
    try {
      await deleteInstrument(id);
      setSuccess('Прибор удалён');
      loadInstruments();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const handlePing = async (id: number) => {
    try {
      const res = await pingInstrument(id);
      setSuccess(`Прибор отвечает: ${res.data.idn}`);
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
                  Эксперимент запущен: {runningExp.name}
                </Typography>
                <Typography variant="body2">
                  Приборы: {runningExp.instrument_ids} | Измерений: {measurementCount}
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
            Выберите приборы (нажмите на строку):
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {instruments.filter((i) => i.active).map((inst) => (
              <Chip
                key={inst.id}
                label={`${inst.name} (${inst.host}:${inst.port})`}
                color={selectedInstruments.includes(inst.id) ? 'primary' : 'default'}
                onClick={() => toggleInstrumentSelection(inst.id)}
                variant={selectedInstruments.includes(inst.id) ? 'filled' : 'outlined'}
              />
            ))}
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Приборы</Typography>
        {isAdmin && (
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            onClick={() => {
              setEditingInst(null);
              setInstForm({ name: '', host: '', port: 45454, active: true });
              setDialogOpen(true);
            }}
          >
            Добавить
          </Button>
        )}
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Адрес</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {instruments.map((inst) => (
              <TableRow key={inst.id}>
                <TableCell>{inst.id}</TableCell>
                <TableCell>{inst.name}</TableCell>
                <TableCell>{inst.host}:{inst.port}</TableCell>
                <TableCell>
                  <Chip label={inst.active ? 'Активен' : 'Выкл'} color={inst.active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handlePing(inst.id)} title="Проверить связь">
                    <NetworkPingIcon />
                  </IconButton>
                  {isAdmin && (
                    <>
                      <IconButton size="small" onClick={() => {
                        setEditingInst(inst);
                        setInstForm({ name: inst.name, host: inst.host, port: inst.port, active: inst.active });
                        setDialogOpen(true);
                      }}>
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDeleteInstrument(inst.id)}>
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {instruments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">Нет приборов</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit instrument dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingInst ? 'Редактировать прибор' : 'Добавить прибор'}</DialogTitle>
        <DialogContent>
          <TextField label="Название" fullWidth sx={{ mt: 1, mb: 2 }} value={instForm.name} onChange={(e) => setInstForm({ ...instForm, name: e.target.value })} />
          <TextField label="Хост (IP)" fullWidth sx={{ mb: 2 }} value={instForm.host} onChange={(e) => setInstForm({ ...instForm, host: e.target.value })} />
          <TextField label="Порт" type="number" fullWidth sx={{ mb: 2 }} value={instForm.port} onChange={(e) => setInstForm({ ...instForm, port: Number(e.target.value) })} />
          <FormControlLabel control={<Switch checked={instForm.active} onChange={(e) => setInstForm({ ...instForm, active: e.target.checked })} />} label="Активен" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveInstrument}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
