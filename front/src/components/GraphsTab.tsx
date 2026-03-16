'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, FormControl,
  InputLabel, Select, MenuItem, Stack, Chip, ToggleButton, ToggleButtonGroup,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Slider, IconButton, Pagination,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, TimeScale,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { getExperimentData, listExperiments, getExperimentVideoUrl, listInstruments } from '@/api';
import type { Experiment, Measurement, Instrument, InstrumentSettings } from '@/types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, TimeScale, zoomPlugin,
);

interface Props {
  experimentId: number | null;
}

const PARAMS = [
  { key: 'voltage', label: 'Напряжение (В)', short: 'U, В', color: '#2196f3' },
  { key: 'current', label: 'Ток (А)', short: 'I, А', color: '#f44336' },
  { key: 'charge', label: 'Заряд (Кл)', short: 'Q, Кл', color: '#4caf50' },
  { key: 'resistance', label: 'Сопротивление (Ом)', short: 'R, Ом', color: '#ff9800' },
  { key: 'temperature', label: 'Температура (°C)', short: 'T, °C', color: '#9c27b0' },
  { key: 'humidity', label: 'Влажность (%)', short: 'H, %', color: '#00bcd4' },
  { key: 'source', label: 'Источник', short: 'Src', color: '#795548' },
  { key: 'math_value', label: 'Math', short: 'Math', color: '#607d8b' },
] as const;

const INST_DASH = [[], [6, 3], [2, 2], [8, 4, 2, 4]] as number[][];
const INST_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2'];

type ParamKey = typeof PARAMS[number]['key'];

// Time-based interval options (seconds)
const INTERVAL_OPTIONS = [
  { sec: 0, label: 'Все' },
  { sec: 0.2, label: '0.2с' },
  { sec: 0.5, label: '0.5с' },
  { sec: 1, label: '1с' },
  { sec: 2, label: '2с' },
  { sec: 5, label: '5с' },
  { sec: 10, label: '10с' },
  { sec: 30, label: '30с' },
  { sec: 60, label: '1мин' },
];

const PER_PAGE_OPTIONS = [100, 250, 500, 1000, 2000];

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function GraphsTab({ experimentId }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<number | null>(experimentId);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeParams, setActiveParams] = useState<ParamKey[]>(['source', 'current']);
  const [chartMode, setChartMode] = useState<'combined' | 'separate'>('combined');
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'video'>('chart');
  const [instrumentsMap, setInstrumentsMap] = useState<Record<number, Instrument>>({});
  const [activeInstruments, setActiveInstruments] = useState<number[]>([]);

  // Time range (ms offsets from timeMin)
  const [timeMin, setTimeMin] = useState<string | null>(null);
  const [timeMax, setTimeMax] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 100]);
  const durationMs = useMemo(() => {
    if (!timeMin || !timeMax) return 0;
    return new Date(timeMax).getTime() - new Date(timeMin).getTime();
  }, [timeMin, timeMax]);

  // Step & pagination
  const [intervalSec, setIntervalSec] = useState(0); // 0 = all points
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(500);
  const [total, setTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const fetchRef = useRef(0);

  useEffect(() => {
    listExperiments().then((res) => setExperiments(res.data)).catch(() => {});
    listInstruments().then((res) => {
      const map: Record<number, Instrument> = {};
      res.data.forEach((inst) => { map[inst.id] = inst; });
      setInstrumentsMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (experimentId !== null) setSelectedExpId(experimentId);
  }, [experimentId]);

  // Reset state on experiment change — first fetch to get time bounds
  useEffect(() => {
    if (selectedExpId === null) return;
    setLoading(true);
    setError('');
    setPage(1);
    setIntervalSec(0);
    setTimeRange([0, 100]);
    getExperimentData(selectedExpId, { per_page: 2000 })
      .then((res) => {
        setExperiment(res.data.experiment);
        const meas = res.data.measurements || [];
        setMeasurements(meas);
        setTotal(res.data.total);
        setFilteredTotal(res.data.filtered_total);
        setTimeMin(res.data.time_min);
        setTimeMax(res.data.time_max);
        // Auto-detect instruments in data
        const ids = [...new Set(meas.map((m) => m.instrument_id))];
        setActiveInstruments(ids);
      })
      .catch((e) => setError(e.response?.data?.error || 'Ошибка загрузки данных'))
      .finally(() => setLoading(false));
  }, [selectedExpId]);

  // Unique instrument IDs in current data
  const instrumentIds = useMemo(() => {
    return [...new Set(measurements.map((m) => m.instrument_id))].sort();
  }, [measurements]);

  const instName = (id: number) => instrumentsMap[id]?.name || instrumentsMap[id]?.model || `#${id}`;

  // Measurement frequency (Hz)
  const measHz = useMemo(() => {
    if (!durationMs || !total) return 5; // default assumption
    return total / (durationMs / 1000);
  }, [total, durationMs]);

  // Convert interval (sec) → step (every Nth row)
  const step = useMemo(() => {
    if (intervalSec <= 0) return 1;
    return Math.max(1, Math.round(intervalSec * measHz));
  }, [intervalSec, measHz]);

  // Filter interval options: hide intervals shorter than measurement period
  const availableIntervals = useMemo(() => {
    const period = measHz > 0 ? 1 / measHz : 0.2;
    return INTERVAL_OPTIONS.filter((o) => o.sec === 0 || o.sec >= period * 1.5);
  }, [measHz]);

  // Fetch with filters (debounced via ref)
  const fetchData = useCallback(async () => {
    if (!selectedExpId || !timeMin || !timeMax) return;
    const id = ++fetchRef.current;
    setLoading(true);

    const minT = new Date(timeMin).getTime();
    const dur = durationMs || 1;
    const from = new Date(minT + (timeRange[0] / 100) * dur).toISOString();
    const to = new Date(minT + (timeRange[1] / 100) * dur).toISOString();

    try {
      const res = await getExperimentData(selectedExpId, {
        from, to, step, page, per_page: perPage,
      });
      if (id !== fetchRef.current) return; // stale
      setMeasurements(res.data.measurements || []);
      setFilteredTotal(res.data.filtered_total);
    } catch (e: any) {
      if (id === fetchRef.current) setError(e.response?.data?.error || 'Ошибка');
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [selectedExpId, timeMin, timeMax, durationMs, timeRange, step, page, perPage]);

  // Debounced fetch on filter change (not on initial load)
  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [timeRange, intervalSec, perPage]);

  const toggleParam = (key: ParamKey) => {
    setActiveParams((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const fmtVal = (v: number) => {
    if (Math.abs(v) >= 999) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) < 0.001) return v.toExponential(3);
    return v.toFixed(4).replace(/\.?0+$/, '');
  };

  // Build datasets grouped by instrument
  const makeDatasets = (params: ParamKey[]) => {
    const filteredInstIds = instrumentIds.filter((id) => activeInstruments.includes(id));
    const multiInst = filteredInstIds.length > 1;

    // For single instrument: use param colors. For multi: use instrument colors + param label
    if (!multiInst) {
      const instMeas = filteredInstIds.length === 1
        ? measurements.filter((m) => m.instrument_id === filteredInstIds[0])
        : measurements;
      return params.map((key) => {
        const param = PARAMS.find((p) => p.key === key)!;
        return {
          label: param.label,
          data: instMeas.map((m) => {
            const v = m[key] as number;
            return Math.abs(v) >= 999 ? null : v;
          }),
          borderColor: param.color,
          backgroundColor: param.color + '33',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          spanGaps: true,
        };
      });
    }

    // Multi-instrument: one dataset per instrument × param
    // Use first instrument's time as reference axis
    const datasets: any[] = [];
    filteredInstIds.forEach((instId, instIdx) => {
      const instMeas = measurements.filter((m) => m.instrument_id === instId);
      const name = instName(instId);
      params.forEach((key) => {
        const param = PARAMS.find((p) => p.key === key)!;
        const color = INST_COLORS[instIdx % INST_COLORS.length];
        datasets.push({
          label: `${name}: ${param.short}`,
          data: instMeas.map((m) => {
            const v = m[key] as number;
            return Math.abs(v) >= 999 ? null : v;
          }),
          borderColor: params.length === 1 ? color : param.color,
          backgroundColor: (params.length === 1 ? color : param.color) + '33',
          borderWidth: 1.5,
          borderDash: INST_DASH[instIdx % INST_DASH.length],
          pointRadius: 0,
          tension: 0.3,
          spanGaps: true,
        });
      });
    });
    return datasets;
  };

  // Labels: use first active instrument's timestamps
  const chartLabels = useMemo(() => {
    const filteredInstIds = instrumentIds.filter((id) => activeInstruments.includes(id));
    const refMeas = filteredInstIds.length > 1
      ? measurements.filter((m) => m.instrument_id === filteredInstIds[0])
      : measurements;
    return refMeas.map((m) => {
      const d = new Date(m.recorded_at);
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        + '.' + String(d.getMilliseconds()).padStart(3, '0');
    });
  }, [measurements, instrumentIds, activeInstruments]);

  const chartOptions = (title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: true, position: 'top' as const },
      title: { display: !!title, text: title },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' as const },
      },
    },
    scales: { x: { ticks: { maxTicksLimit: 20, maxRotation: 45 } } },
  });

  const visibleParams = PARAMS.filter((p) => activeParams.includes(p.key));
  const totalPages = Math.max(1, Math.ceil(filteredTotal / perPage));

  // Time range labels for slider
  const rangeFromLabel = timeMin
    ? fmtTime(new Date(new Date(timeMin).getTime() + (timeRange[0] / 100) * durationMs).toISOString())
    : '';
  const rangeToLabel = timeMin
    ? fmtTime(new Date(new Date(timeMin).getTime() + (timeRange[1] / 100) * durationMs).toISOString())
    : '';

  return (
    <Box>
      {/* Row 1: experiment selector + view toggle */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }} alignItems={{ md: 'center' }}>
        <FormControl sx={{ minWidth: 300 }} size="small">
          <InputLabel>Эксперимент</InputLabel>
          <Select
            value={selectedExpId ?? ''}
            label="Эксперимент"
            onChange={(e) => setSelectedExpId(e.target.value as number)}
          >
            {experiments.map((exp) => {
              const d = exp.start_time ? new Date(exp.start_time) : null;
              const date = d ? d.toLocaleDateString('ru-RU') : '';
              const time = d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
              const author = exp.user ? `${exp.user.first_name} ${exp.user.last_name}` : '';
              return (
                <MenuItem key={exp.id} value={exp.id}>
                  {exp.name}{author ? ` — ${author}` : ''}{date ? `, ${date} ${time}` : ''}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
          <ToggleButton value="chart">График</ToggleButton>
          <ToggleButton value="table">Таблица</ToggleButton>
          {experiment?.video_path && <ToggleButton value="video">Видео</ToggleButton>}
        </ToggleButtonGroup>

        {experiment && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {total.toLocaleString()} изм.
            {durationMs > 0 && <> | {fmtMs(durationMs)}</>}
          </Typography>
        )}

        {/* Experiment settings summary */}
        {experiment?.settings_json && experiment.settings_json !== '{}' && (() => {
          try {
            const settings = JSON.parse(experiment.settings_json) as Record<string, InstrumentSettings>;
            const parts = Object.entries(settings).map(([instId, s]) => {
              const inst = instrumentsMap[Number(instId)];
              const name = inst?.name || inst?.model || `#${instId}`;
              const funcLabel = s.function === 'CURR' ? 'Ток' : s.function === 'RES' ? 'Сопр.' : 'Заряд';
              return `${name}: ${funcLabel} ${s.frequency}Гц${s.source_on ? ` HV:${s.source_volt}В` : ''}`;
            });
            return (
              <Chip label={parts.join(' | ')} size="small" variant="outlined" color="info" sx={{ whiteSpace: 'normal', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal' } }} />
            );
          } catch { return null; }
        })()}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {!selectedExpId && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Выберите эксперимент из списка</Typography>
        </Paper>
      )}

      {loading && <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>}

      {selectedExpId && !loading && (viewMode === 'chart' || viewMode === 'table') && (
        <>
          {/* Controls bar: params + time range + step */}
          <Paper sx={{ p: 1, mb: 1 }}>
            {/* Instrument chips (if multiple) */}
            {instrumentIds.length > 1 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Приборы:</Typography>
                {instrumentIds.map((id, idx) => (
                  <Chip
                    key={id}
                    label={instName(id)}
                    onClick={() => setActiveInstruments((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )}
                    color={activeInstruments.includes(id) ? 'primary' : 'default'}
                    variant={activeInstruments.includes(id) ? 'filled' : 'outlined'}
                    size="small"
                    sx={{ borderColor: INST_COLORS[idx % INST_COLORS.length] }}
                  />
                ))}
              </Box>
            )}

            {/* Parameter chips */}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Параметры:</Typography>
              {PARAMS.map((p) => (
                <Chip
                  key={p.key}
                  label={p.short}
                  onClick={() => toggleParam(p.key)}
                  color={activeParams.includes(p.key) ? 'primary' : 'default'}
                  variant={activeParams.includes(p.key) ? 'filled' : 'outlined'}
                  size="small"
                  sx={{
                    borderColor: p.color,
                    ...(activeParams.includes(p.key) ? { bgcolor: p.color, color: '#fff' } : {}),
                  }}
                />
              ))}
            </Box>

            {/* Time range slider */}
            {durationMs > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 65, textAlign: 'right' }}>
                  {rangeFromLabel}
                </Typography>
                <Slider
                  value={timeRange}
                  onChange={(_, v) => setTimeRange(v as [number, number])}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => {
                    if (!timeMin) return '';
                    const t = new Date(new Date(timeMin).getTime() + (v / 100) * durationMs);
                    return t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  }}
                  size="small"
                  sx={{ flexGrow: 1 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 65 }}>
                  {rangeToLabel}
                </Typography>
              </Stack>
            )}

            {/* Step selector + info */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">Интервал:</Typography>
              <ToggleButtonGroup value={intervalSec} exclusive size="small"
                onChange={(_, v) => { if (v !== null) setIntervalSec(v); }}>
                {availableIntervals.map((o) => (
                  <ToggleButton key={o.sec} value={o.sec} sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                    {o.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {viewMode === 'table' && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>На стр:</Typography>
                  <Select value={perPage} size="small" variant="standard"
                    onChange={(e) => setPerPage(e.target.value as number)}
                    sx={{ fontSize: '0.75rem', minWidth: 60 }}>
                    {PER_PAGE_OPTIONS.map((n) => (
                      <MenuItem key={n} value={n} sx={{ fontSize: '0.8rem' }}>{n}</MenuItem>
                    ))}
                  </Select>
                </>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {filteredTotal.toLocaleString()} строк
                {measHz > 0 && <> | {measHz.toFixed(1)} Гц</>}
                {intervalSec > 0 && <> | шаг {intervalSec}с (×{step})</>}
              </Typography>
            </Stack>
          </Paper>

          {measurements.length > 0 && viewMode === 'chart' && (
            <>
              <ToggleButtonGroup
                value={chartMode} exclusive onChange={(_, v) => v && setChartMode(v)}
                size="small" sx={{ mb: 1 }}
              >
                <ToggleButton value="combined">Совмещённый</ToggleButton>
                <ToggleButton value="separate">Раздельный</ToggleButton>
              </ToggleButtonGroup>

              {chartMode === 'combined' ? (
                <Paper sx={{ p: 1, height: { xs: 300, md: 450 } }}>
                  <Line data={{ labels: chartLabels, datasets: makeDatasets(activeParams) }} options={chartOptions('')} />
                </Paper>
              ) : (
                <Stack spacing={1.5}>
                  {activeParams.map((key) => {
                    const param = PARAMS.find((p) => p.key === key)!;
                    return (
                      <Paper key={key} sx={{ p: 1, height: { xs: 220, md: 300 } }}>
                        <Line data={{ labels: chartLabels, datasets: makeDatasets([key]) }} options={chartOptions(param.label)} />
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </>
          )}

          {measurements.length > 0 && viewMode === 'table' && (
            <>
              <TableContainer component={Paper} sx={{ maxHeight: { xs: 400, md: 550 } }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>#</TableCell>
                      {instrumentIds.length > 1 && (
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Прибор</TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Время</TableCell>
                      {visibleParams.map((p) => (
                        <TableCell key={p.key} sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: p.color }}>
                          {p.short}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {measurements.filter((m) => activeInstruments.includes(m.instrument_id)).map((m, i) => (
                      <TableRow key={m.id} hover>
                        <TableCell>{(page - 1) * perPage + i + 1}</TableCell>
                        {instrumentIds.length > 1 && (
                          <TableCell sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            {instName(m.instrument_id)}
                          </TableCell>
                        )}
                        <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {new Date(m.recorded_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          <Typography component="span" sx={{ fontSize: '0.65rem', color: 'text.disabled', ml: 0.3 }}>
                            .{String(new Date(m.recorded_at).getMilliseconds()).padStart(3, '0')}
                          </Typography>
                        </TableCell>
                        {visibleParams.map((p) => (
                          <TableCell key={p.key} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {fmtVal(m[p.key] as number)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              {totalPages > 1 && (
                <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                  <IconButton size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(_, p) => setPage(p)}
                    size="small"
                    siblingCount={1}
                    boundaryCount={1}
                  />
                  <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <NavigateNextIcon />
                  </IconButton>
                </Stack>
              )}
            </>
          )}

          {measurements.length === 0 && !error && (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Нет данных в выбранном диапазоне</Typography>
            </Paper>
          )}
        </>
      )}

      {viewMode === 'video' && experiment?.video_path && (
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <video
            src={getExperimentVideoUrl(experiment.id)}
            controls
            autoPlay
            style={{ width: '100%', maxHeight: '70vh', borderRadius: 8 }}
          />
        </Paper>
      )}

      {selectedExpId && !loading && total === 0 && !error && viewMode !== 'video' && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Нет данных для этого эксперимента</Typography>
        </Paper>
      )}
    </Box>
  );
}
