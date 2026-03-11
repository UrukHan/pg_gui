'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Chip, Switch,
  FormControlLabel, Checkbox, Alert, CircularProgress, Stack,
  ToggleButton, ToggleButtonGroup, Slider, Snackbar, Tabs, Tab, Fab,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAuth } from '@/context/AuthContext';
import {
  listInstruments, startExperiment, stopExperiment, listExperiments,
  getExperimentStatus, getExperimentData, listCameras, applyInstrumentSettings,
} from '@/api';
import type { Instrument, Camera, Experiment, Measurement, InstrumentSettings } from '@/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const defaultSettings = (): InstrumentSettings => ({
  function: 'CURR', source_on: false, source_volt: 0,
  auto_range: true, range: '', frequency: 5, zero_correct: true,
});

export default function InstrumentsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasAccess = user?.instrument_access || isAdmin;

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [expName, setExpName] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [runningExp, setRunningExp] = useState<Experiment | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  const [buttonLock, setButtonLock] = useState(false);

  const [settingsMap, setSettingsMap] = useState<Record<string, InstrumentSettings>>({});
  const getSettings = (id: number): InstrumentSettings => settingsMap[String(id)] || defaultSettings();
  const updateSettings = (id: number, patch: Partial<InstrumentSettings>) => {
    setSettingsMap((prev) => ({
      ...prev,
      [String(id)]: { ...(prev[String(id)] || defaultSettings()), ...patch },
    }));
  };

  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const [activeChartInstIdx, setActiveChartInstIdx] = useState(0);
  const [liveMeasurements, setLiveMeasurements] = useState<Measurement[]>([]);

  const onlineInsts = useMemo(() => instruments.filter((i) => i.active && i.online), [instruments]);
  const allInsts = useMemo(() => instruments.filter((i) => i.active), [instruments]);

  const isOwner = !!(runningExp && user && runningExp.user_id === user.id);
  const isOtherRunning = !!(runningExp && user && runningExp.user_id !== user.id);

  // --- Debounced apply settings ---
  const applyTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const applySettingsDebounced = useCallback((instId: number, settings: InstrumentSettings) => {
    const key = String(instId);
    if (applyTimers.current[key]) clearTimeout(applyTimers.current[key]);
    applyTimers.current[key] = setTimeout(async () => {
      try {
        await applyInstrumentSettings(instId, settings);
      } catch (e: any) {
        console.warn('[apply settings]', e.message);
      }
    }, 800);
  }, []);

  const updateAndApply = useCallback((id: number, patch: Partial<InstrumentSettings>) => {
    setSettingsMap((prev) => {
      const next = { ...(prev[String(id)] || defaultSettings()), ...patch };
      if (runningExp) applySettingsDebounced(id, next);
      return { ...prev, [String(id)]: next };
    });
  }, [runningExp, applySettingsDebounced]);

  // --- Effects ---
  const loadData = useCallback(async () => {
    try {
      const [instRes, camRes] = await Promise.all([listInstruments(), listCameras()]);
      setInstruments(instRes.data);
      setCameras(camRes.data);
    } catch { setError('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  const checkRunning = useCallback(async () => {
    try {
      const res = await listExperiments();
      const running = res.data.find((e: Experiment) => e.status === 'running');
      if (running) {
        setRunningExp(running);
        const st = await getExperimentStatus(running.id);
        setMeasurementCount(st.data.measurement_count);
        // Restore settings from running experiment
        if (running.settings_json) {
          try {
            const parsed = JSON.parse(running.settings_json);
            setSettingsMap(parsed);
          } catch {}
        }
      } else {
        setRunningExp(null);
      }
    } catch {}
  }, []);

  useEffect(() => { loadData(); checkRunning(); }, [loadData, checkRunning]);

  useEffect(() => {
    if (!runningExp) return;
    const iv = setInterval(async () => {
      try {
        const st = await getExperimentStatus(runningExp.id);
        setMeasurementCount(st.data.measurement_count);
        if (st.data.experiment.status !== 'running') {
          setRunningExp(null);
          setLiveMeasurements([]);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [runningExp]);

  useEffect(() => {
    if (!runningExp) { setLiveMeasurements([]); return; }
    const fetchData = async () => {
      try {
        const res = await getExperimentData(runningExp.id, { per_page: 200 });
        setLiveMeasurements(res.data.measurements || []);
      } catch {}
    };
    fetchData();
    const iv = setInterval(fetchData, 2000);
    return () => clearInterval(iv);
  }, [runningExp]);

  // --- Handlers ---
  const handleStart = async () => {
    if (buttonLock || runningExp) return;
    if (!expName.trim()) { setError('Введите название'); return; }
    if (onlineInsts.length === 0) { setError('Нет приборов онлайн'); return; }
    setButtonLock(true);
    setError('');
    try {
      const settingsPayload: Record<string, InstrumentSettings> = {};
      for (const inst of onlineInsts) {
        settingsPayload[String(inst.id)] = getSettings(inst.id);
      }
      const res = await startExperiment({
        name: expName,
        instrument_ids: onlineInsts.map((i) => i.id).join(','),
        notes: expNotes,
        settings: settingsPayload,
      });
      setRunningExp(res.data.experiment);
      setMeasurementCount(0);
      setSuccess('Эксперимент запущен');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка запуска');
    } finally { setButtonLock(false); }
  };

  const handleStop = async () => {
    if (!runningExp || buttonLock) return;
    setButtonLock(true);
    try {
      await stopExperiment(runningExp.id);
      setRunningExp(null);
      setLiveMeasurements([]);
      setSuccess('Эксперимент остановлен');
      setExpName('');
      setExpNotes('');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка остановки');
    } finally { setButtonLock(false); }
  };

  // --- Chart data ---
  const chartInstId = onlineInsts[activeChartInstIdx]?.id;
  const instMeasurements = useMemo(() =>
    liveMeasurements.filter((m) => m.instrument_id === chartInstId).slice(-100),
    [liveMeasurements, chartInstId]
  );
  const chartLabels = useMemo(() =>
    instMeasurements.map((m) =>
      new Date(m.recorded_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    ), [instMeasurements]
  );
  const voltageData = useMemo(() => ({
    labels: chartLabels,
    datasets: [{
      label: 'Напряжение (В)',
      data: instMeasurements.map((m) => m.source),
      borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.08)',
      borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true,
    }],
  }), [chartLabels, instMeasurements]);

  const paramData = useMemo(() => {
    const s = chartInstId ? getSettings(chartInstId) : defaultSettings();
    const key = s.function === 'RES' ? 'resistance' : s.function === 'CHAR' ? 'charge' : 'current';
    const label = s.function === 'RES' ? 'Сопротивление (Ом)' : s.function === 'CHAR' ? 'Заряд (Кл)' : 'Ток (А)';
    return {
      labels: chartLabels,
      datasets: [{
        label,
        data: instMeasurements.map((m) => (m as any)[key]),
        borderColor: '#2196f3', backgroundColor: 'rgba(33,150,243,0.08)',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true,
      }],
    };
  }, [chartLabels, instMeasurements, chartInstId, settingsMap]);

  const chartOpts: any = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: true, ticks: { maxTicksLimit: 5, font: { size: 9 } } },
      y: { display: true, ticks: { font: { size: 9 } } },
    },
  }), []);

  // --- Render ---
  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setSuccess('')}>{success}</Alert>
      </Snackbar>

      {/* Overlay for other user's running experiment */}
      {isOtherRunning && (
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(2px)', borderRadius: 1,
        }}>
          <Paper elevation={6} sx={{ p: 4, textAlign: 'center', borderRadius: 3, maxWidth: 400 }}>
            <FiberManualRecordIcon sx={{ fontSize: 16, color: 'error.main', mr: 0.5, animation: 'pulse 1.5s infinite' }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>Идёт эксперимент</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {runningExp?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Измерений: {measurementCount}
            </Typography>
            {hasAccess && (
              <Fab color="error" onClick={handleStop} disabled={buttonLock}
                sx={{ width: 72, height: 72, boxShadow: '0 4px 20px rgba(244,67,54,0.4)' }}>
                <StopIcon sx={{ fontSize: 36 }} />
              </Fab>
            )}
          </Paper>
        </Box>
      )}

      <Box sx={{
        flex: 1, display: 'flex', flexDirection: 'column',
        opacity: isOtherRunning ? 0.25 : 1,
        pointerEvents: isOtherRunning ? 'none' : 'auto',
        transition: 'opacity 0.3s',
      }}>
        {/* ===== TOP HALF ===== */}
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr 1fr' }, gap: 1, p: 0.5, minHeight: 0 }}>

          {/* COL 1: Name, Notes, Cameras, Start/Stop */}
          <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
            {!runningExp ? (
              <>
                <TextField label="Название" value={expName} onChange={(e) => setExpName(e.target.value)}
                  size="small" fullWidth />
                <TextField label="Заметки" value={expNotes} onChange={(e) => setExpNotes(e.target.value)}
                  size="small" fullWidth multiline rows={2} />
              </>
            ) : (
              <Box>
                <Typography variant="subtitle1" fontWeight={700} color="success.main">{runningExp.name}</Typography>
                {runningExp.notes && (
                  <Typography variant="caption" color="text.secondary">{runningExp.notes}</Typography>
                )}
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Измерений: <b>{measurementCount}</b>
                </Typography>
              </Box>
            )}

            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mt: 0.5 }}>Камеры</Typography>
            {cameras.length === 0 && (
              <Typography variant="caption" color="text.disabled">Нет камер</Typography>
            )}
            {cameras.map((cam) => (
              <Stack key={cam.id} direction="row" alignItems="center" spacing={0.5}>
                <VideocamIcon sx={{ fontSize: 18, color: cam.active ? 'success.main' : 'text.disabled' }} />
                <Typography variant="caption" sx={{ flex: 1 }} noWrap>{cam.name}</Typography>
                <Chip label={cam.online ? 'On' : 'Off'} size="small"
                  color={cam.online ? 'success' : 'default'} variant="outlined"
                  sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.6rem' } }} />
              </Stack>
            ))}

            <Box sx={{ mt: 'auto', pt: 1 }}>
              {!runningExp ? (
                <Button variant="contained" color="success" fullWidth startIcon={<PlayArrowIcon />}
                  onClick={handleStart}
                  disabled={buttonLock || !expName.trim() || onlineInsts.length === 0}
                  sx={{ py: 1.2, fontWeight: 700, fontSize: '0.9rem' }}>
                  Запустить
                </Button>
              ) : isOwner ? (
                <Button variant="contained" color="error" fullWidth startIcon={<StopIcon />}
                  onClick={handleStop} disabled={buttonLock}
                  sx={{ py: 1.2, fontWeight: 700, fontSize: '0.9rem' }}>
                  Остановить
                </Button>
              ) : null}
            </Box>
          </Paper>

          {/* COL 2: Camera view */}
          <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {cameras.length > 0 && (
              <Tabs value={activeCamIdx} onChange={(_, v) => setActiveCamIdx(v)} variant="fullWidth"
                sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' } }}>
                {cameras.map((cam, i) => (
                  <Tab key={cam.id} label={cam.name} value={i}
                    icon={<VideocamIcon sx={{ fontSize: 14 }} />} iconPosition="start"
                    sx={{ minHeight: 32, gap: 0.5 }} />
                ))}
              </Tabs>
            )}
            <Box sx={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: '#111', color: '#666', minHeight: 100,
            }}>
              {cameras.length > 0 && cameras[activeCamIdx]?.online ? (
                <Stack alignItems="center" spacing={0.5}>
                  <VideocamIcon sx={{ fontSize: 48, color: '#444' }} />
                  <Typography variant="caption" color="#888">
                    {cameras[activeCamIdx]?.name}
                  </Typography>
                  <Typography variant="caption" color="#555">
                    Трансляция (placeholder)
                  </Typography>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <VideocamOffIcon sx={{ fontSize: 48, color: '#333' }} />
                  <Typography variant="caption" color="#555">
                    {cameras.length === 0 ? 'Нет камер' : 'Нет сигнала'}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Paper>

          {/* COL 3: Instrument live charts */}
          <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {onlineInsts.length > 0 && (
              <Tabs value={activeChartInstIdx} onChange={(_, v) => setActiveChartInstIdx(v)} variant="fullWidth"
                sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' } }}>
                {onlineInsts.map((inst, i) => (
                  <Tab key={inst.id} label={inst.model || inst.name} value={i} />
                ))}
              </Tabs>
            )}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0.5, minHeight: 0, overflow: 'hidden' }}>
              <Typography variant="caption" fontWeight={600} color="error.main" sx={{ px: 0.5 }}>
                Напряжение источника (В)
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {instMeasurements.length > 0 ? (
                  <Line data={voltageData} options={chartOpts} />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="caption" color="text.disabled">
                      {runningExp ? 'Ожидание данных...' : 'Запустите эксперимент'}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ px: 0.5, mt: 0.5 }}>
                {chartInstId
                  ? (getSettings(chartInstId).function === 'RES' ? 'Сопротивление (Ом)'
                    : getSettings(chartInstId).function === 'CHAR' ? 'Заряд (Кл)' : 'Ток (А)')
                  : 'Измеряемый параметр'}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {instMeasurements.length > 0 ? (
                  <Line data={paramData} options={chartOpts} />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="caption" color="text.disabled">
                      {runningExp ? 'Ожидание данных...' : 'Запустите эксперимент'}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* ===== BOTTOM HALF: 3 instrument control panels ===== */}
        <Box sx={{
          flex: 1, display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(allInsts.length || 1, 3)}, 1fr)` },
          gap: 1, p: 0.5, minHeight: 0,
        }}>
          {allInsts.slice(0, 3).map((inst) => {
            const s = getSettings(inst.id);
            const upd = (patch: Partial<InstrumentSettings>) => {
              if (runningExp) {
                updateAndApply(inst.id, patch);
              } else {
                updateSettings(inst.id, patch);
              }
            };
            const disabled = !inst.online || isOtherRunning;
            return (
              <Paper key={inst.id} variant="outlined" sx={{
                p: 1.5, display: 'flex', flexDirection: 'column', overflow: 'auto',
                opacity: inst.online ? 1 : 0.35,
              }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap>
                    {inst.model || inst.name}
                  </Typography>
                  <Chip label={inst.online ? 'Online' : 'Offline'} size="small"
                    color={inst.online ? 'success' : 'error'}
                    variant={inst.online ? 'filled' : 'outlined'}
                    sx={{ height: 22 }} />
                </Stack>

                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.3 }}>Режим измерения</Typography>
                <ToggleButtonGroup value={s.function} exclusive size="small" fullWidth disabled={disabled}
                  onChange={(_, v) => v && upd({ function: v })}
                  sx={{ mb: 1, '& .MuiToggleButton-root': { flex: 1, fontSize: '0.75rem', py: 0.3 } }}>
                  <ToggleButton value="CURR">Ток (A)</ToggleButton>
                  <ToggleButton value="RES">Сопр. (R)</ToggleButton>
                  <ToggleButton value="CHAR">Заряд (Q)</ToggleButton>
                </ToggleButtonGroup>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
                  <TextField label="Гц" type="number" size="small" disabled={disabled}
                    value={s.frequency} sx={{ width: 70 }}
                    onChange={(e) => { let v = Number(e.target.value); if (v < 1) v = 1; if (v > 20) v = 20; upd({ frequency: v }); }}
                    inputProps={{ min: 1, max: 20, step: 1 }} />
                  <FormControlLabel sx={{ m: 0 }}
                    label={<Typography variant="caption">Авто</Typography>}
                    control={<Switch checked={s.auto_range} size="small" disabled={disabled}
                      onChange={(e) => upd({ auto_range: e.target.checked })} />} />
                  <FormControlLabel sx={{ m: 0 }}
                    label={<Typography variant="caption">Zero</Typography>}
                    control={<Checkbox checked={s.zero_correct} size="small" disabled={disabled}
                      onChange={(e) => upd({ zero_correct: e.target.checked })} />} />
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <FormControlLabel sx={{ m: 0 }}
                    label={<Typography variant="caption" fontWeight={700} color={s.source_on ? 'error' : 'text.secondary'}>HV</Typography>}
                    control={<Switch checked={s.source_on} size="small" disabled={disabled}
                      color="error"
                      onChange={(e) => upd({ source_on: e.target.checked })} />} />
                  <TextField label="В" type="number" size="small"
                    disabled={disabled || !s.source_on}
                    value={s.source_volt} sx={{ width: 90 }}
                    onChange={(e) => upd({ source_volt: Number(e.target.value) })}
                    inputProps={{ min: -1000, max: 1000, step: 1 }} />
                </Stack>
                <Slider value={s.source_volt} min={-1000} max={1000} step={1} size="small"
                  disabled={disabled || !s.source_on} color="error"
                  onChange={(_, v) => upd({ source_volt: v as number })}
                  valueLabelDisplay="auto"
                  marks={[{ value: -1000, label: '-1kV' }, { value: 0, label: '0' }, { value: 1000, label: '1kV' }]}
                  sx={{ mx: 1 }} />
              </Paper>
            );
          })}
          {allInsts.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
              <Typography color="text.secondary">Нет настроенных приборов</Typography>
            </Paper>
          )}
        </Box>
      </Box>

      {/* Pulse animation for recording indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  );
}
