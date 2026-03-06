'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Chip, Switch, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, FormControlLabel,
  Alert, CircularProgress, Divider, Card, CardContent, Stack, IconButton,
  ToggleButton, ToggleButtonGroup, Slider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAuth } from '@/context/AuthContext';
import VideocamIcon from '@mui/icons-material/Videocam';
import {
  listInstruments, toggleInstrument, pingInstrument,
  startExperiment, stopExperiment, listExperiments, getExperimentStatus,
  listCameras, toggleCamera,
} from '@/api';
import type { Instrument, Camera, Experiment, InstrumentSettings } from '@/types';

export default function InstrumentsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasInstrumentAccess = user?.instrument_access || isAdmin;

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Experiment start
  const [expName, setExpName] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState<number[]>([]);

  // Per-instrument settings: key = instrument ID as string
  const defaultSettings = (): InstrumentSettings => ({
    function: 'CURR', source_on: false, source_volt: 0,
    auto_range: true, range: '', frequency: 5, zero_correct: true,
  });
  const [settingsMap, setSettingsMap] = useState<Record<string, InstrumentSettings>>({});
  const [infoOpen, setInfoOpen] = useState(false);

  // Which instrument settings are being edited
  const [configInstId, setConfigInstId] = useState<number | null>(null);

  // Helper: get settings for an instrument (with defaults)
  const getSettings = (id: number): InstrumentSettings => settingsMap[String(id)] || defaultSettings();
  const updateSettings = (id: number, patch: Partial<InstrumentSettings>) => {
    setSettingsMap((prev) => ({
      ...prev,
      [String(id)]: { ...(prev[String(id)] || defaultSettings()), ...patch },
    }));
  };

  // Running experiment tracking
  const [runningExp, setRunningExp] = useState<Experiment | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  const [polling, setPolling] = useState(false);

  const loadInstruments = useCallback(async () => {
    try {
      const [instRes, camRes] = await Promise.all([listInstruments(), listCameras()]);
      setInstruments(instRes.data);
      setCameras(camRes.data);
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

  const handleToggleCamera = async (id: number) => {
    try {
      await toggleCamera(id);
      loadInstruments();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка переключения камеры');
    }
  };

  // Auto-select first online instrument for config
  useEffect(() => {
    const online = instruments.filter((i) => i.active && i.online);
    if (online.length > 0 && configInstId === null) {
      setConfigInstId(online[0].id);
    }
  }, [instruments, configInstId]);

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
      // Build per-instrument settings map for backend
      const settingsPayload: Record<string, InstrumentSettings> = {};
      for (const id of selectedInstruments) {
        settingsPayload[String(id)] = getSettings(id);
      }
      const res = await startExperiment({
        name: expName,
        instrument_ids: selectedInstruments.join(','),
        notes: expNotes,
        settings: settingsPayload,
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
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>Запуск эксперимента</Typography>
            <IconButton size="small" onClick={() => setInfoOpen(true)} title="Справка">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
            <TextField label="Название" value={expName} onChange={(e) => setExpName(e.target.value)} fullWidth size="small" />
            <TextField label="Заметки" value={expNotes} onChange={(e) => setExpNotes(e.target.value)} fullWidth size="small" />
          </Stack>

          {/* Instrument selection */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Приборы:</Typography>
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

          {/* Per-instrument settings — always visible */}
          {(() => {
            const onlineInsts = instruments.filter((i) => i.active && i.online);
            if (onlineInsts.length === 0) return null;
            const cid = configInstId ?? onlineInsts[0]?.id;
            if (!cid) return null;
            const s = getSettings(cid);
            const upd = (patch: Partial<InstrumentSettings>) => updateSettings(cid, patch);
            return (
              <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, mb: 1.5 }}>
                {/* Instrument selector tabs — always visible */}
                <ToggleButtonGroup value={cid} exclusive size="small" sx={{ mb: 1.5, flexWrap: 'wrap' }}
                  onChange={(_, v) => { if (v !== null) setConfigInstId(v); }}>
                  {onlineInsts.map((inst) => {
                    const is = getSettings(inst.id);
                    return (
                      <ToggleButton key={inst.id} value={inst.id}
                        sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', textTransform: 'none' }}>
                        {inst.model || inst.name}
                        <Chip label={is.function} size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
                          color={is.function === 'CURR' ? 'error' : is.function === 'RES' ? 'warning' : 'info'} />
                      </ToggleButton>
                    );
                  })}
                </ToggleButtonGroup>

                <Stack spacing={1.5}>
                  {/* Measurement mode */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                      Режим измерения
                    </Typography>
                    <ToggleButtonGroup value={s.function} exclusive size="small" fullWidth
                      onChange={(_, v) => v && upd({ function: v })}
                      sx={{ '& .MuiToggleButton-root': { flex: 1, fontSize: '0.8rem', py: 0.5 } }}>
                      <ToggleButton value="CURR">Ток (A)</ToggleButton>
                      <ToggleButton value="RES">Сопр. (R)</ToggleButton>
                      <ToggleButton value="CHAR">Заряд (Q)</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* Frequency + Auto-range + Zero correct — one row */}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                    <TextField label="Частота, Гц" type="number" size="small"
                      value={s.frequency}
                      onChange={(e) => {
                        let v = Number(e.target.value);
                        if (v < 1) v = 1; if (v > 20) v = 20;
                        upd({ frequency: v });
                      }}
                      inputProps={{ min: 1, max: 20, step: 1 }}
                      sx={{ width: { xs: '100%', sm: 130 } }}
                      helperText={`${s.frequency} зам./сек`}
                    />
                    <FormControlLabel
                      control={<Switch checked={s.auto_range} size="small"
                        onChange={(e) => upd({ auto_range: e.target.checked })} />}
                      label={<Typography variant="body2">Авто-диапазон</Typography>}
                    />
                    <FormControlLabel
                      control={<Checkbox checked={s.zero_correct} size="small"
                        onChange={(e) => upd({ zero_correct: e.target.checked })} />}
                      label={<Typography variant="body2">Корр. нуля</Typography>}
                    />
                  </Stack>

                  {/* Source HV */}
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <FormControlLabel
                        control={<Switch checked={s.source_on} size="small"
                          onChange={(e) => upd({ source_on: e.target.checked })} />}
                        label={<Typography variant="body2">Источник HV</Typography>}
                        sx={{ mr: 0 }}
                      />
                      {s.source_on && (
                        <TextField label="В" type="number" size="small"
                          value={s.source_volt}
                          onChange={(e) => upd({ source_volt: Number(e.target.value) })}
                          inputProps={{ min: -1000, max: 1000, step: 1 }}
                          sx={{ width: 120 }}
                        />
                      )}
                    </Stack>
                    {s.source_on && (
                      <Slider value={s.source_volt} min={-1000} max={1000} step={1}
                        onChange={(_, v) => upd({ source_volt: v as number })}
                        valueLabelDisplay="auto" size="small"
                        marks={[{ value: -1000, label: '-1kV' }, { value: 0, label: '0' }, { value: 1000, label: '1kV' }]}
                        sx={{ mt: 0.5, width: '80%', mx: 'auto' }}
                      />
                    )}
                  </Box>
                </Stack>
              </Paper>
            );
          })()}

          {/* Summary + Start button */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {selectedInstruments.map((id) => {
                const s = getSettings(id);
                const inst = instruments.find((i) => i.id === id);
                const name = inst?.model || inst?.name || `#${id}`;
                return `${name}: ${s.function} ${s.frequency}Гц`;
              }).join(' | ')}
            </Typography>
            <Button
              variant="contained" color="success" startIcon={<PlayArrowIcon />}
              onClick={handleStart} disabled={!expName.trim() || selectedInstruments.length === 0}
              sx={{ minWidth: { xs: 'auto', sm: 140 } }}
            >
              Запустить
            </Button>
          </Stack>
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
                disabled={!inst.online && !inst.active}
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

      {/* Cameras list */}
      {cameras.length > 0 && (
        <>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2, mb: 1 }}>Камеры</Typography>
          <Stack spacing={1}>
            {cameras.map((cam) => (
              <Paper key={cam.id} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
                  <VideocamIcon sx={{ mr: 1.5, color: cam.active ? 'success.main' : 'text.disabled' }} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={600} noWrap>{cam.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {cam.rtsp_url.replace(/\/\/.*@/, '//***@')}
                    </Typography>
                  </Box>
                  <Chip
                    label={cam.online ? 'Online' : 'Offline'}
                    color={cam.online ? 'info' : 'error'}
                    size="small"
                    variant={cam.online ? 'filled' : 'outlined'}
                    sx={{ mr: 1 }}
                  />
                  <Chip
                    label={cam.online ? (cam.active ? 'Запись вкл' : 'Запись выкл') : 'Недоступна'}
                    color={cam.online ? (cam.active ? 'success' : 'default') : 'error'}
                    size="small"
                    variant={cam.online && cam.active ? 'filled' : 'outlined'}
                    sx={{ mr: 1 }}
                  />
                  <Switch
                    checked={cam.active}
                    onChange={() => handleToggleCamera(cam.id)}
                    size="small"
                    disabled={!cam.online}
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      {/* Info dialog */}
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { maxHeight: '85vh' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon color="info" /> Справка
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2" color="primary" gutterBottom>Режим измерения</Typography>
          <Typography variant="body2" paragraph>
            Электрометр TH2690 измеряет <b>только один параметр</b> за раз:
          </Typography>
          <Box component="ul" sx={{ mt: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><b>Ток (A)</b> — амперметр. Диапазон: фА – мА.</Typography></li>
            <li><Typography variant="body2"><b>Сопр. (R)</b> — омметр. Для высокоомных материалов.</Typography></li>
            <li><Typography variant="body2"><b>Заряд (Q)</b> — кулонметр. Накопленный заряд.</Typography></li>
          </Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            Напряжение, температура, влажность записываются всегда.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Частота (Гц)</Typography>
          <Typography variant="body2" paragraph>
            Сколько замеров в секунду снимает прибор (1–20 Гц).
            Прибор автоматически выбирает скорость интеграции:
            ≥10 Гц → FAST, ≥3 Гц → MED, &lt;3 Гц → SLOW.
            Больше частота = больше данных, но меньше точность.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Источник HV</Typography>
          <Typography variant="body2" paragraph>
            Встроенный источник напряжения ±1000 В.
            Подаёт HV на образец для измерения тока утечки / сопротивления.
            <b> Осторожно</b> — подаётся при старте эксперимента.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Авто-диапазон / Корр. нуля</Typography>
          <Typography variant="body2" paragraph>
            <b>Авто-диапазон</b> — прибор сам выбирает масштаб. Отключите для ускорения.
            <br />
            <b>Корр. нуля</b> — компенсация смещения. Рекомендуется для малых токов.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Камера</Typography>
          <Typography variant="body2" paragraph>
            Запись видео стартует автоматически с активных камер.
            Видео доступно в деталях запуска.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)} variant="contained" size="small">Понятно</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
