'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Chip, Switch,
  FormControlLabel, Checkbox, Alert, CircularProgress, Stack,
  ToggleButton, ToggleButtonGroup, Slider, Snackbar, Tabs, Tab, Fab,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow, LinearProgress,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TimelineIcon from '@mui/icons-material/Timeline';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAuth } from '@/context/AuthContext';
import {
  listInstruments, toggleInstrument, startExperiment, stopExperiment, listExperiments,
  getExperimentStatus, getExperimentData, listCameras, toggleCamera, applyInstrumentSettings,
} from '@/api';
import type { Instrument, Camera, Experiment, Measurement, InstrumentSettings, HvPoint } from '@/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const defaultSettings = (): InstrumentSettings => ({
  function: 'CURR', source_on: false, source_volt: 0,
  auto_range: true, range: '', frequency: 5, zero_correct: true,
});

function fmtTime(sec: number): string {
  if (sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function interpolateSchedule(points: HvPoint[], timeSec: number): number {
  if (!points.length) return 0;
  if (timeSec <= points[0].time_sec) return points[0].voltage;
  if (timeSec >= points[points.length - 1].time_sec) return points[points.length - 1].voltage;
  for (let i = 1; i < points.length; i++) {
    if (timeSec <= points[i].time_sec) {
      const p0 = points[i - 1], p1 = points[i];
      const dt = p1.time_sec - p0.time_sec;
      if (dt <= 0) return p1.voltage;
      const t = (timeSec - p0.time_sec) / dt;
      return p0.voltage + t * (p1.voltage - p0.voltage);
    }
  }
  return points[points.length - 1].voltage;
}

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
  const [durationSec, setDurationSec] = useState(60);
  const [runningExp, setRunningExp] = useState<Experiment | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  const [buttonLock, setButtonLock] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [settingsMap, setSettingsMap] = useState<Record<string, InstrumentSettings>>({});
  const getSettings = (id: number): InstrumentSettings => settingsMap[String(id)] || defaultSettings();
  const updateSettings = (id: number, patch: Partial<InstrumentSettings>) => {
    setSettingsMap((prev) => ({
      ...prev,
      [String(id)]: { ...(prev[String(id)] || defaultSettings()), ...patch },
    }));
  };

  // HV schedule per instrument
  const [hvScheduleMap, setHvScheduleMap] = useState<Record<string, HvPoint[]>>({});
  const getSchedule = (id: number): HvPoint[] => hvScheduleMap[String(id)] || [];
  const setSchedule = (id: number, pts: HvPoint[]) => {
    setHvScheduleMap((prev) => ({ ...prev, [String(id)]: [...pts].sort((a, b) => a.time_sec - b.time_sec) }));
  };

  // Schedule editor dialog
  const [scheduleInstId, setScheduleInstId] = useState<number | null>(null);
  const [editPoints, setEditPoints] = useState<HvPoint[]>([]);
  const [scheduleMode, setScheduleMode] = useState<'linear' | 'stepped'>('linear');
  // Stepped mode params
  const [stepStartV, setStepStartV] = useState(0);
  const [stepDeltaV, setStepDeltaV] = useState(10);
  const [stepDeltaSec, setStepDeltaSec] = useState(5);
  const [stepCount, setStepCount] = useState(10);

  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const [activeChartInstIdx, setActiveChartInstIdx] = useState(0);
  const [liveMeasurements, setLiveMeasurements] = useState<Measurement[]>([]);

  const onlineInsts = useMemo(() => instruments.filter((i) => i.online), [instruments]);
  const activeOnlineInsts = useMemo(() => instruments.filter((i) => i.active && i.online), [instruments]);
  const allInsts = useMemo(() => instruments, [instruments]);

  const isOwner = !!(runningExp && user && runningExp.user_id === user.id);
  const isOtherRunning = !!(runningExp && user && runningExp.user_id !== user.id);

  // --- Debounced apply settings ---
  const applyTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const applySettingsDebounced = useCallback((instId: number, settings: InstrumentSettings) => {
    const key = String(instId);
    if (applyTimers.current[key]) clearTimeout(applyTimers.current[key]);
    applyTimers.current[key] = setTimeout(async () => {
      try { await applyInstrumentSettings(instId, settings); } catch {}
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
        if (running.name) setExpName(running.name);
        if (running.notes) setExpNotes(running.notes);
        if (running.duration_sec) setDurationSec(running.duration_sec);
        const st = await getExperimentStatus(running.id);
        setMeasurementCount(st.data.measurement_count);
        if (running.settings_json) { try { setSettingsMap(JSON.parse(running.settings_json)); } catch {} }
        if (running.hv_schedule_json && running.hv_schedule_json !== '{}') {
          try { setHvScheduleMap(JSON.parse(running.hv_schedule_json)); } catch {}
        }
      } else { setRunningExp(null); }
    } catch {}
  }, []);

  useEffect(() => { loadData(); checkRunning(); }, [loadData, checkRunning]);

  // Countdown timer
  useEffect(() => {
    if (!runningExp?.start_time || !runningExp.duration_sec) { setCountdown(0); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(runningExp.start_time!).getTime()) / 1000;
      const remaining = Math.max(0, runningExp.duration_sec - elapsed);
      setCountdown(remaining);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [runningExp]);

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
    if (activeOnlineInsts.length === 0) { setError('Нет активных приборов онлайн'); return; }
    setButtonLock(true);
    setError('');
    try {
      const settingsPayload: Record<string, InstrumentSettings> = {};
      for (const inst of activeOnlineInsts) {
        settingsPayload[String(inst.id)] = getSettings(inst.id);
      }
      // Build HV schedule payload (only for instruments that have a schedule)
      const hvPayload: Record<string, HvPoint[]> = {};
      for (const inst of activeOnlineInsts) {
        const pts = getSchedule(inst.id);
        if (pts.length > 0) hvPayload[String(inst.id)] = pts;
      }
      const res = await startExperiment({
        name: expName,
        instrument_ids: activeOnlineInsts.map((i) => i.id).join(','),
        notes: expNotes,
        settings: settingsPayload,
        duration_sec: durationSec > 0 ? durationSec : undefined,
        hv_schedule: Object.keys(hvPayload).length > 0 ? hvPayload : undefined,
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

  // --- Schedule editor helpers ---
  const openScheduleEditor = (instId: number) => {
    setScheduleInstId(instId);
    setEditPoints([...getSchedule(instId)]);
  };
  const addSchedulePoint = () => {
    const last = editPoints[editPoints.length - 1];
    setEditPoints([...editPoints, { time_sec: last ? last.time_sec + 10 : 0, voltage: last ? last.voltage : 0 }]);
  };
  // Ensure at least 1 default point when opening editor
  const openScheduleEditorWrapped = (instId: number) => {
    const pts = getSchedule(instId);
    setScheduleInstId(instId);
    setEditPoints(pts.length > 0 ? [...pts] : [{ time_sec: 0, voltage: 0 }]);
    setScheduleMode('linear');
  };

  // Generate stepped points from params (End V = Start V + Step V * Count)
  const generateSteppedPoints = () => {
    const pts: HvPoint[] = [];
    let v = stepStartV;
    let t = 0;
    const endV = stepStartV + stepDeltaV * stepCount;
    for (let i = 0; i < stepCount; i++) {
      const clamped = Math.max(-1000, Math.min(1000, v));
      pts.push({ time_sec: t, voltage: clamped });
      pts.push({ time_sec: t + stepDeltaSec - 0.01, voltage: clamped });
      t += stepDeltaSec;
      v += stepDeltaV;
    }
    const totalTime = stepCount * stepDeltaSec;
    const maxAbsV = Math.max(Math.abs(stepStartV), Math.abs(endV));
    const warnings: string[] = [];
    if (durationSec > 0 && totalTime > durationSec) warnings.push(`\u0412\u0440\u0435\u043c\u044f ${totalTime}\u0441 > \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c ${durationSec}\u0441`);
    if (maxAbsV > 1000) warnings.push(`\u041d\u0430\u043f\u0440\u044f\u0436\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0438\u0433\u0430\u0435\u0442 ${endV}\u0412 (\u043f\u0440\u0435\u0434\u0435\u043b \u00b11000\u0412)`);
    return { pts, warnings, totalTime, endV };
  };
  const removeSchedulePoint = (idx: number) => {
    setEditPoints(editPoints.filter((_, i) => i !== idx));
  };
  const updateSchedulePoint = (idx: number, field: 'time_sec' | 'voltage', value: number) => {
    setEditPoints(editPoints.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const saveSchedule = () => {
    if (scheduleInstId !== null) {
      setSchedule(scheduleInstId, editPoints);
    }
    setScheduleInstId(null);
  };

  // Schedule preview chart data
  const schedulePreviewData = useMemo(() => {
    if (!editPoints.length) return null;
    const sorted = [...editPoints].sort((a, b) => a.time_sec - b.time_sec);
    const labels: number[] = [];
    const data: number[] = [];
    const maxT = Math.max(sorted[sorted.length - 1]?.time_sec || 0, durationSec);
    for (let t = 0; t <= maxT; t += Math.max(1, Math.floor(maxT / 100))) {
      labels.push(t);
      data.push(interpolateSchedule(sorted, t));
    }
    return {
      labels: labels.map((t) => fmtTime(t)),
      datasets: [{
        label: 'HV (В)', data,
        borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.1)',
        borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true,
      }],
    };
  }, [editPoints, durationSec]);

  // --- Live chart data ---
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

  // Voltage chart with planned schedule overlay
  const voltageData = useMemo(() => {
    const datasets: any[] = [{
      label: 'Факт (В)',
      data: instMeasurements.map((m) => m.source),
      borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.08)',
      borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true,
    }];
    // Add planned schedule as dashed line
    if (chartInstId && runningExp?.start_time) {
      const pts = getSchedule(chartInstId);
      if (pts.length > 0) {
        const startMs = new Date(runningExp.start_time).getTime();
        datasets.push({
          label: 'План (В)',
          data: instMeasurements.map((m) => {
            const elapsedSec = (new Date(m.recorded_at).getTime() - startMs) / 1000;
            return interpolateSchedule(pts, elapsedSec);
          }),
          borderColor: '#ff9800', borderDash: [6, 3],
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false,
        });
      }
    }
    return { labels: chartLabels, datasets };
  }, [chartLabels, instMeasurements, chartInstId, runningExp, hvScheduleMap]);

  const paramData = useMemo(() => {
    const s = chartInstId ? getSettings(chartInstId) : defaultSettings();
    const key = s.function === 'RES' ? 'resistance' : s.function === 'CHAR' ? 'charge' : 'current';
    const label = s.function === 'RES' ? 'Сопротивление (Ом)' : s.function === 'CHAR' ? 'Заряд (Кл)' : 'Ток (А)';
    return {
      labels: chartLabels,
      datasets: [{
        label, data: instMeasurements.map((m) => (m as any)[key]),
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

  const chartOptsWithLegend: any = useMemo(() => ({
    ...chartOpts,
    plugins: { legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 9 } } } },
  }), [chartOpts]);

  // --- Render ---
  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  const elapsedSec = runningExp?.start_time
    ? (Date.now() - new Date(runningExp.start_time).getTime()) / 1000
    : 0;
  const progress = runningExp?.duration_sec
    ? Math.min(100, (elapsedSec / runningExp.duration_sec) * 100)
    : 0;

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
            <Typography variant="body1" color="text.secondary">{runningExp?.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Измерений: {measurementCount}
              {runningExp?.duration_sec ? ` | Осталось: ${fmtTime(countdown)}` : ''}
            </Typography>
            {runningExp?.duration_sec ? (
              <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, borderRadius: 1 }} />
            ) : null}
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

          {/* COL 1: Name, Notes, Duration, Cameras, Start/Stop */}
          <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
            {!runningExp ? (
              <>
                <TextField label="Название" value={expName} onChange={(e) => setExpName(e.target.value)}
                  size="small" fullWidth />
                <TextField label="Заметки" value={expNotes} onChange={(e) => setExpNotes(e.target.value)}
                  size="small" fullWidth multiline rows={1} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField label="Длительность" type="number" size="small"
                    value={durationSec} sx={{ width: 110 }}
                    onChange={(e) => { let v = Number(e.target.value); if (v < 0) v = 0; setDurationSec(v); }}
                    inputProps={{ min: 0, step: 10 }}
                  />
                  <Typography variant="caption" color="text.secondary">сек</Typography>
                </Stack>
              </>
            ) : (
              <Box>
                <Typography variant="subtitle1" fontWeight={700} color="success.main">{runningExp.name}</Typography>
                {runningExp.notes && (
                  <Typography variant="caption" color="text.secondary" display="block">{runningExp.notes}</Typography>
                )}
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Измерений: <b>{measurementCount}</b>
                </Typography>
                {runningExp.duration_sec > 0 && (
                  <Box sx={{ mt: 0.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {fmtTime(elapsedSec)} / {fmtTime(runningExp.duration_sec)}
                      </Typography>
                      <Typography variant="caption" fontWeight={700}
                        color={countdown < 10 ? 'error.main' : 'text.secondary'}>
                        Осталось: {fmtTime(countdown)}
                      </Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={progress}
                      sx={{ mt: 0.3, borderRadius: 1, height: 6 }} />
                  </Box>
                )}
              </Box>
            )}

            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mt: 0.5 }}>Камеры</Typography>
            {cameras.length === 0 && <Typography variant="caption" color="text.disabled">Нет камер</Typography>}
            {cameras.map((cam) => (
              <Stack key={cam.id} direction="row" alignItems="center" spacing={0.5}>
                {cam.online
                  ? <VideocamIcon sx={{ fontSize: 18, color: 'success.main' }} />
                  : <VideocamOffIcon sx={{ fontSize: 18, color: 'error.main' }} />}
                <Typography variant="caption" sx={{ flex: 1, opacity: cam.active ? 1 : 0.4 }} noWrap>{cam.name}</Typography>
                <Switch size="small" checked={cam.active} disabled={!!runningExp}
                  onChange={async () => {
                    try { await toggleCamera(cam.id); setCameras((p) => p.map((c) => c.id === cam.id ? { ...c, active: !c.active } : c)); } catch {}
                  }} />
              </Stack>
            ))}

            <Box sx={{ mt: 'auto', pt: 1 }}>
              {!runningExp ? (
                <Button variant="contained" color="success" fullWidth startIcon={<PlayArrowIcon />}
                  onClick={handleStart}
                  disabled={buttonLock || !expName.trim() || activeOnlineInsts.length === 0 || !!runningExp}
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
                  <Typography variant="caption" color="#888">{cameras[activeCamIdx]?.name}</Typography>
                  <Typography variant="caption" color="#555">Трансляция (placeholder)</Typography>
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
                  <Tab key={inst.id} label={inst.name} value={i} />
                ))}
              </Tabs>
            )}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0.5, minHeight: 0, overflow: 'hidden' }}>
              <Typography variant="caption" fontWeight={600} color="error.main" sx={{ px: 0.5 }}>
                Напряжение источника (В)
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {instMeasurements.length > 0 ? (
                  <Line data={voltageData}
                    options={chartInstId && getSchedule(chartInstId).length > 0 ? chartOptsWithLegend : chartOpts} />
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
            const schedule = getSchedule(inst.id);
            const upd = (patch: Partial<InstrumentSettings>) => {
              if (runningExp) { updateAndApply(inst.id, patch); } else { updateSettings(inst.id, patch); }
            };
            const disabled = !inst.online || !inst.active || isOtherRunning;
            return (
              <Paper key={inst.id} variant="outlined" sx={{
                p: 1.5, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap
                    sx={{ opacity: inst.active ? 1 : 0.4 }}>
                    {inst.name}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <IconButton size="small" disabled={disabled || !!runningExp}
                      onClick={() => openScheduleEditorWrapped(inst.id)}
                      title="Расписание HV"
                      sx={{ color: schedule.length > 0 ? 'warning.main' : 'text.disabled' }}>
                      <TimelineIcon fontSize="small" />
                    </IconButton>
                    <Switch size="small" checked={inst.active} disabled={!!runningExp}
                      onChange={async () => {
                        try { await toggleInstrument(inst.id); setInstruments((p) => p.map((x) => x.id === inst.id ? { ...x, active: !x.active } : x)); } catch {}
                      }} />
                    <Chip label={inst.online ? 'Online' : 'Offline'} size="small"
                      color={inst.online ? 'success' : 'error'}
                      variant={inst.online ? 'filled' : 'outlined'}
                      sx={{ height: 22 }} />
                  </Stack>
                </Stack>

                {schedule.length > 0 && (
                  <Chip label={`HV расписание: ${schedule.length} точек`}
                    size="small" color="warning" variant="outlined"
                    sx={{ mb: 0.5, alignSelf: 'flex-start', height: 20, fontSize: '0.65rem', opacity: inst.active ? 1 : 0.4 }} />
                )}

                <Box sx={{ opacity: inst.active && inst.online ? 1 : 0.3, pointerEvents: inst.active && inst.online ? 'auto' : 'none' }}>
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
                    control={<Switch checked={s.source_on} size="small" disabled={disabled || schedule.length > 0}
                      color="error"
                      onChange={(e) => upd({ source_on: e.target.checked })} />} />
                  <TextField label="В" type="number" size="small"
                    disabled={disabled || !s.source_on || schedule.length > 0}
                    value={s.source_volt} sx={{ width: 90 }}
                    onChange={(e) => upd({ source_volt: Number(e.target.value) })}
                    inputProps={{ min: -1000, max: 1000, step: 1 }} />
                </Stack>
                <Box sx={{ width: '80%', mx: 'auto' }}>
                  <Slider value={s.source_volt} min={-1000} max={1000} step={1} size="small"
                    disabled={disabled || !s.source_on || schedule.length > 0} color="error"
                    onChange={(_, v) => upd({ source_volt: v as number })}
                    valueLabelDisplay="auto"
                    marks={[{ value: -1000, label: '-1kV' }, { value: 0, label: '0' }, { value: 1000, label: '1kV' }]} />
                </Box>
                </Box>{/* end opacity wrapper */}
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

      {/* ===== HV Schedule Editor Dialog ===== */}
      <Dialog open={scheduleInstId !== null} onClose={() => setScheduleInstId(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimelineIcon color="warning" />
          Расписание HV — {scheduleInstId !== null && (instruments.find((i) => i.id === scheduleInstId)?.name || `#${scheduleInstId}`)}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Длительность эксперимента: <b>{fmtTime(durationSec)}</b>
          </Typography>

          <Tabs value={scheduleMode} onChange={(_, v) => setScheduleMode(v)} sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: '0.8rem' } }}>
            <Tab label="Линейный" value="linear" />
            <Tab label="Ступенчатый" value="stepped" />
          </Tabs>

          {scheduleMode === 'linear' ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Задайте ключевые точки. Между точками значение интерполируется линейно.
              </Typography>
              <Box sx={{ maxHeight: 180, overflowY: 'auto', mb: 1,
                '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
              }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, width: 120 }}>Время (сек)</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 120 }}>Напряжение (В)</TableCell>
                      <TableCell sx={{ width: 50 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {editPoints.map((pt, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <TextField type="number" size="small" value={pt.time_sec}
                            onChange={(e) => updateSchedulePoint(idx, 'time_sec', Number(e.target.value))}
                            inputProps={{ min: 0, max: durationSec || 9999, step: 1 }}
                            sx={{ width: 100 }} />
                        </TableCell>
                        <TableCell>
                          <TextField type="number" size="small" value={pt.voltage}
                            onChange={(e) => updateSchedulePoint(idx, 'voltage', Number(e.target.value))}
                            inputProps={{ min: -1000, max: 1000, step: 1 }}
                            sx={{ width: 100 }} />
                        </TableCell>
                        <TableCell>
                          {idx === 0
                            ? <Box sx={{ width: 32 }} />
                            : <IconButton size="small" onClick={() => removeSchedulePoint(idx)} color="error">
                                <DeleteIcon fontSize="small" />
                              </IconButton>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Button startIcon={<AddIcon />} onClick={addSchedulePoint} size="small" variant="outlined">
                Добавить точку
              </Button>
            </>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Задайте параметры ступенчатого изменения напряжения.
              </Typography>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1}>
                  <TextField label="Старт (В)" type="number" size="small" value={stepStartV}
                    onChange={(e) => setStepStartV(Number(e.target.value))}
                    inputProps={{ min: -1000, max: 1000, step: 1 }} sx={{ flex: 1 }} />
                  <TextField label="Шаг (В)" type="number" size="small" value={stepDeltaV}
                    onChange={(e) => setStepDeltaV(Number(e.target.value))}
                    inputProps={{ min: -2000, max: 2000, step: 1 }} sx={{ flex: 1 }} />
                  <TextField label="Шаг (сек)" type="number" size="small" value={stepDeltaSec}
                    onChange={(e) => { let v = Number(e.target.value); if (v < 1) v = 1; setStepDeltaSec(v); }}
                    inputProps={{ min: 1, max: 9999, step: 1 }} sx={{ flex: 1 }} />
                  <TextField label="Кол-во" type="number" size="small" value={stepCount}
                    onChange={(e) => { let v = Number(e.target.value); if (v < 1) v = 1; if (v > 200) v = 200; setStepCount(v); }}
                    inputProps={{ min: 1, max: 200, step: 1 }} sx={{ flex: 1 }} />
                </Stack>
                {(() => {
                  const { warnings, totalTime, endV } = generateSteppedPoints();
                  return (
                    <>
                      <Typography variant="caption" color="text.secondary">
                        {stepStartV}В → {endV}В | {stepCount} ступеней | {totalTime} сек ({fmtTime(totalTime)})
                      </Typography>
                      {warnings.map((w, i) => (
                        <Alert key={i} severity="warning" sx={{ py: 0, fontSize: '0.75rem' }}>{w}</Alert>
                      ))}
                    </>
                  );
                })()}
                <Button variant="outlined" size="small" onClick={() => {
                  const { pts } = generateSteppedPoints();
                  setEditPoints(pts);
                }}>
                  Сгенерировать точки
                </Button>
              </Stack>
            </>
          )}

          {schedulePreviewData && (
            <Box sx={{ mt: 2, height: 160 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Превью ({editPoints.length} точек)
              </Typography>
              <Line data={schedulePreviewData} options={{
                responsive: true, maintainAspectRatio: false,
                animation: false as const,
                plugins: { legend: { display: false } },
                scales: {
                  x: { display: true, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
                  y: { display: true, ticks: { font: { size: 9 } } },
                },
              }} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleInstId(null)}>Отмена</Button>
          <Button onClick={() => { if (scheduleInstId) setSchedule(scheduleInstId, []); setScheduleInstId(null); }}
            color="warning">Очистить</Button>
          <Button onClick={saveSchedule} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  );
}
