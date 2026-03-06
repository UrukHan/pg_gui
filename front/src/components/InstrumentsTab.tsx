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
import SettingsIcon from '@mui/icons-material/Settings';
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
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Experiment start
  const [expName, setExpName] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState<number[]>([]);

  // Instrument settings
  const [settings, setSettings] = useState<InstrumentSettings>({
    function: 'CURR', source_on: false, source_volt: 0,
    auto_range: true, range: '', speed: 'MED', zero_correct: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Measurement params selector
  const [paramsDialogOpen, setParamsDialogOpen] = useState(false);
  const [selectedParams, setSelectedParams] = useState<string[]>(ALL_PARAMS.map((p) => p.key));

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
        settings,
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
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={() => setInfoOpen(true)} title="Справка по настройкам">
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setParamsDialogOpen(true)} title="Параметры измерения">
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
            <TextField label="Название" value={expName} onChange={(e) => setExpName(e.target.value)} fullWidth size="small" />
            <TextField label="Заметки" value={expNotes} onChange={(e) => setExpNotes(e.target.value)} fullWidth size="small" />
          </Stack>

          {/* Instrument selection */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Приборы для записи:</Typography>
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

          {/* Instrument settings accordion */}
          <Box sx={{ mb: 1.5 }}>
            <Button size="small" variant="text" onClick={() => setSettingsOpen(!settingsOpen)}
              startIcon={settingsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', color: 'text.secondary' }}>
              Настройки электрометра
            </Button>
            <Collapse in={settingsOpen}>
              <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, mt: 0.5 }}>
                <Stack spacing={1.5}>
                  {/* Function — single measurement mode */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                      Режим измерения <Typography component="span" variant="caption" color="warning.main">(одновременно только один)</Typography>
                    </Typography>
                    <ToggleButtonGroup value={settings.function} exclusive size="small" fullWidth
                      onChange={(_, v) => v && setSettings({ ...settings, function: v })}
                      sx={{ '& .MuiToggleButton-root': { flex: 1, fontSize: { xs: '0.7rem', sm: '0.8rem' }, px: { xs: 0.5, sm: 1.5 } } }}>
                      <ToggleButton value="CURR">Ток (A)</ToggleButton>
                      <ToggleButton value="RES">Сопр. (R)</ToggleButton>
                      <ToggleButton value="CHAR">Заряд (Q)</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* Source HV */}
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <FormControlLabel
                        control={<Switch checked={settings.source_on} size="small"
                          onChange={(e) => setSettings({ ...settings, source_on: e.target.checked })} />}
                        label={<Typography variant="body2">Источник HV</Typography>}
                        sx={{ mr: 0 }}
                      />
                      {settings.source_on && (
                        <TextField label="В" type="number" size="small"
                          value={settings.source_volt}
                          onChange={(e) => setSettings({ ...settings, source_volt: Number(e.target.value) })}
                          inputProps={{ min: -1000, max: 1000, step: 1 }}
                          sx={{ width: { xs: 90, sm: 120 } }}
                        />
                      )}
                    </Stack>
                    {settings.source_on && (
                      <Slider value={settings.source_volt} min={-1000} max={1000} step={1}
                        onChange={(_, v) => setSettings({ ...settings, source_volt: v as number })}
                        valueLabelDisplay="auto" size="small"
                        marks={[{ value: -1000, label: '-1kV' }, { value: 0, label: '0' }, { value: 1000, label: '1kV' }]}
                        sx={{ mt: 0.5, mx: 1 }}
                      />
                    )}
                  </Box>

                  {/* Speed */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Скорость</Typography>
                    <ToggleButtonGroup value={settings.speed} exclusive size="small"
                      onChange={(_, v) => v && setSettings({ ...settings, speed: v })}
                      sx={{ '& .MuiToggleButton-root': { fontSize: { xs: '0.7rem', sm: '0.8rem' }, px: { xs: 1, sm: 1.5 } } }}>
                      <ToggleButton value="FAST">Быстро</ToggleButton>
                      <ToggleButton value="MED">Средне</ToggleButton>
                      <ToggleButton value="SLOW">Точно</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* Range & Zero — compact row */}
                  <Stack direction="row" spacing={{ xs: 1, sm: 2 }} flexWrap="wrap">
                    <FormControlLabel
                      control={<Switch checked={settings.auto_range} size="small"
                        onChange={(e) => setSettings({ ...settings, auto_range: e.target.checked })} />}
                      label={<Typography variant="body2" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>Авто-диапазон</Typography>}
                    />
                    <FormControlLabel
                      control={<Checkbox checked={settings.zero_correct} size="small"
                        onChange={(e) => setSettings({ ...settings, zero_correct: e.target.checked })} />}
                      label={<Typography variant="body2" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>Коррекция нуля</Typography>}
                    />
                  </Stack>
                </Stack>
              </Paper>
            </Collapse>
          </Box>

          {/* Bottom: params summary + start button */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {selectedParams.length === ALL_PARAMS.length ? 'Все параметры' : `${selectedParams.length}/${ALL_PARAMS.length} парам.`}
              {settings.function === 'CURR' && ' | Ток'}
              {settings.function === 'RES' && ' | Сопр.'}
              {settings.function === 'CHAR' && ' | Заряд'}
              {settings.source_on && ` | HV ${settings.source_volt}В`}
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
                    label={cam.active ? 'Запись вкл' : 'Запись выкл'}
                    color={cam.active ? 'success' : 'default'}
                    size="small"
                    variant={cam.active ? 'filled' : 'outlined'}
                    sx={{ mr: 1 }}
                  />
                  <Switch
                    checked={cam.active}
                    onChange={() => handleToggleCamera(cam.id)}
                    size="small"
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
        </>
      )}

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

      {/* Info dialog */}
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { maxHeight: '85vh' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon color="info" /> Справка: настройки эксперимента
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2" color="primary" gutterBottom>Режим измерения</Typography>
          <Typography variant="body2" paragraph>
            Электрометр TH2690 измеряет <b>только один параметр</b> за раз:
          </Typography>
          <Box component="ul" sx={{ mt: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><b>Ток (A)</b> — амперметр, измерение постоянного тока. Диапазон от фА до мА.</Typography></li>
            <li><Typography variant="body2"><b>Сопр. (R)</b> — омметр, измерение сопротивления. Для высокоомных материалов.</Typography></li>
            <li><Typography variant="body2"><b>Заряд (Q)</b> — кулонметр, измерение накопленного заряда.</Typography></li>
          </Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            Остальные поля (напряжение, температура, влажность) записываются всегда.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Источник HV</Typography>
          <Typography variant="body2" paragraph>
            Встроенный источник высокого напряжения (от -1000 до +1000 В).
            Подаёт постоянное напряжение на образец для измерения тока утечки или сопротивления изоляции.
            <b> Будьте осторожны</b> — высокое напряжение подаётся сразу при старте эксперимента.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Скорость измерения</Typography>
          <Box component="ul" sx={{ mt: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><b>Быстро (FAST)</b> — максимальная скорость, меньшая точность. Для быстрых процессов.</Typography></li>
            <li><Typography variant="body2"><b>Средне (MED)</b> — баланс скорости и точности. Рекомендуется по умолчанию.</Typography></li>
            <li><Typography variant="body2"><b>Точно (SLOW)</b> — максимальная точность, медленный опрос. Для стабильных измерений.</Typography></li>
          </Box>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Авто-диапазон</Typography>
          <Typography variant="body2" paragraph>
            Прибор автоматически выбирает оптимальный диапазон измерения.
            Отключите, если знаете ожидаемый порядок величины — это ускорит измерение.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Коррекция нуля</Typography>
          <Typography variant="body2" paragraph>
            Компенсация смещения нуля прибора. Рекомендуется оставить включённой
            для точных измерений малых токов и зарядов.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" color="primary" gutterBottom>Камера</Typography>
          <Typography variant="body2" paragraph>
            При запуске эксперимента автоматически начинается запись видео с активных камер.
            Видео сохраняется в хранилище и доступно на вкладке статистики.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)} variant="contained" size="small">Понятно</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
