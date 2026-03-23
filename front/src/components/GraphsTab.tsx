'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, FormControl,
  InputLabel, Select, MenuItem, Stack, Chip, ToggleButton, ToggleButtonGroup,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Slider, IconButton, Pagination, Button, Tooltip as MuiTooltip,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DownloadIcon from '@mui/icons-material/Download';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController,
  Filler, Title, Tooltip, Legend, TimeScale,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Chart } from 'react-chartjs-2';
import { getExperimentData, getExperimentAggData, listExperiments, getExperimentVideoUrl, listInstruments } from '@/api';
import type { Experiment, Measurement, AggBucket, Instrument, InstrumentSettings } from '@/types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController,
  Filler, Title, Tooltip, Legend, TimeScale, zoomPlugin,
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
  { key: 'source', label: 'Источник (В)', short: 'Src, В', color: '#795548' },
  { key: 'math_value', label: 'Math', short: 'Math', color: '#607d8b' },
] as const;

const INST_DASH = [[], [6, 3], [2, 2], [8, 4, 2, 4]] as number[][];
const INST_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2'];

type ParamKey = typeof PARAMS[number]['key'];

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
const DEFAULT_CHART_PTS = 1500;
const MAX_CHART_PTS = 2000;

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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function downloadChartPng(chartRef: React.RefObject<ChartJS | null>, name: string) {
  const chart = chartRef.current;
  if (!chart) return;
  const url = chart.toBase64Image('image/png', 1);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}

export default function GraphsTab({ experimentId }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<number | null>(experimentId);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [aggBuckets, setAggBuckets] = useState<AggBucket[]>([]);
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
  const [committedTimeRange, setCommittedTimeRange] = useState<[number, number]>([0, 100]);
  const durationMs = useMemo(() => {
    if (!timeMin || !timeMax) return 0;
    return new Date(timeMax).getTime() - new Date(timeMin).getTime();
  }, [timeMin, timeMax]);

  // Step & pagination (table mode)
  const [intervalSec, setIntervalSec] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(500);
  const [total, setTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const fetchRef = useRef(0);

  // Chart container width — use ref to avoid re-render/re-fetch loops
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartPtsRef = useRef(DEFAULT_CHART_PTS);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          if (w > 100) chartPtsRef.current = Math.min(MAX_CHART_PTS, w);
        }
      }, 500);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  // Chart refs for screenshot
  const combinedChartRef = useRef<ChartJS | null>(null);
  const separateChartRefs = useRef<Record<string, ChartJS | null>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);

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

  // Initial load: fetch aggregate overview
  useEffect(() => {
    if (selectedExpId === null) return;
    setLoading(true);
    setError('');
    setPage(1);
    setIntervalSec(0);
    setTimeRange([0, 100]);
    setCommittedTimeRange([0, 100]);
    getExperimentAggData(selectedExpId, { max_points: chartPtsRef.current })
      .then((res) => {
        setExperiment(res.data.experiment);
        const bk = res.data.buckets || [];
        setAggBuckets(bk);
        setTotal(res.data.total);
        setFilteredTotal(res.data.total);
        setTimeMin(res.data.time_min);
        setTimeMax(res.data.time_max);
        setMeasurements([]);
        const ids = [...new Set(bk.map((b) => b.instrument_id))];
        setActiveInstruments(ids);
      })
      .catch((e) => setError(e.response?.data?.error || 'Ошибка загрузки данных'))
      .finally(() => setLoading(false));
  }, [selectedExpId]);

  // Unique instrument IDs in aggregated data
  const instrumentIds = useMemo(() => {
    if (aggBuckets.length > 0) return [...new Set(aggBuckets.map((b) => b.instrument_id))].sort();
    return [...new Set(measurements.map((m) => m.instrument_id))].sort();
  }, [aggBuckets, measurements]);

  const instName = (id: number) => instrumentsMap[id]?.name || instrumentsMap[id]?.model || `#${id}`;

  const measHz = useMemo(() => {
    if (!durationMs || !total) return 5;
    return total / (durationMs / 1000);
  }, [total, durationMs]);

  const step = useMemo(() => {
    if (intervalSec <= 0) return 1;
    return Math.max(1, Math.round(intervalSec * measHz));
  }, [intervalSec, measHz]);

  const availableIntervals = useMemo(() => {
    const period = measHz > 0 ? 1 / measHz : 0.2;
    return INTERVAL_OPTIONS.filter((o) => o.sec === 0 || o.sec >= period * 1.5);
  }, [measHz]);

  // Fetch data on filter changes (debounced)
  const fetchData = useCallback(async () => {
    if (!selectedExpId || !timeMin || !timeMax) return;
    const id = ++fetchRef.current;
    setLoading(true);

    const minT = new Date(timeMin).getTime();
    const dur = durationMs || 1;
    const fromTime = committedTimeRange[0] > 0 ? new Date(minT + (committedTimeRange[0] / 100) * dur).toISOString() : undefined;
    const toTime = committedTimeRange[1] < 100 ? new Date(minT + (committedTimeRange[1] / 100) * dur).toISOString() : undefined;

    try {
      if (viewMode === 'chart') {
        const res = await getExperimentAggData(selectedExpId, {
          from: fromTime, to: toTime, max_points: chartPtsRef.current,
        });
        if (id !== fetchRef.current) return;
        setAggBuckets(res.data.buckets || []);
        setFilteredTotal(res.data.total);
      } else {
        const res = await getExperimentData(selectedExpId, {
          from: fromTime, to: toTime, step, page, per_page: perPage,
        });
        if (id !== fetchRef.current) return;
        setMeasurements(res.data.measurements || []);
        setFilteredTotal(res.data.filtered_total);
      }
    } catch (e: any) {
      if (id === fetchRef.current) setError(e.response?.data?.error || 'Ошибка');
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [selectedExpId, timeMin, timeMax, durationMs, committedTimeRange, step, page, perPage, viewMode]);

  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  useEffect(() => { setPage(1); }, [committedTimeRange, intervalSec, perPage, viewMode]);

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

  // ── Aggregate chart data helpers ──
  const aggByInstrument = useMemo(() => {
    const map: Record<number, AggBucket[]> = {};
    aggBuckets.forEach((b) => {
      if (!map[b.instrument_id]) map[b.instrument_id] = [];
      map[b.instrument_id].push(b);
    });
    return map;
  }, [aggBuckets]);

  // Labels + raw timestamps from first active instrument's buckets
  const aggTimestamps = useRef<number[]>([]);
  const aggLabels = useMemo(() => {
    const filteredIds = instrumentIds.filter((id) => activeInstruments.includes(id));
    const refId = filteredIds[0];
    const bks = refId != null ? (aggByInstrument[refId] || []) : [];
    const ts: number[] = [];
    const labels = bks.map((b) => {
      const d = new Date(b.recorded_at);
      ts.push(d.getTime());
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });
    aggTimestamps.current = ts;
    return labels;
  }, [aggByInstrument, instrumentIds, activeInstruments]);

  // Build aggregate datasets — memoized to avoid re-creation during slider drag
  const buildAggDatasets = useCallback((params: ParamKey[], instIds: number[], agg: Record<number, AggBucket[]>) => {
    const multiInst = instIds.length > 1;
    const datasets: any[] = [];

    // Sort instruments: largest avg |current_max| renders first (behind)
    const instAvgAbs: Record<number, number> = {};
    if (multiInst) {
      instIds.forEach((instId) => {
        const bks = agg[instId] || [];
        if (bks.length === 0) { instAvgAbs[instId] = 0; return; }
        let sum = 0;
        bks.forEach((b) => { sum += Math.abs(b.current_max); });
        instAvgAbs[instId] = sum / bks.length;
      });
    }
    const sortedInstIds = multiInst
      ? [...instIds].sort((a, b) => (instAvgAbs[b] || 0) - (instAvgAbs[a] || 0))
      : instIds;

    sortedInstIds.forEach((instId) => {
      const bks = agg[instId] || [];
      const origIdx = instIds.indexOf(instId);
      const name = multiInst ? instName(instId) : '';

      params.forEach((key) => {
        const param = PARAMS.find((p) => p.key === key)!;
        const minKey = `${key}_min` as keyof AggBucket;
        const maxKey = `${key}_max` as keyof AggBucket;
        const isCurrent = key === 'current';
        const baseColor = multiInst && params.length === 1
          ? INST_COLORS[origIdx % INST_COLORS.length]
          : param.color;
        const label = name ? `${name}: ${param.short}` : param.label;

        if (isCurrent) {
          // Layered fill: max area (lighter, behind) + min area (solid, on top)
          // Max fill: 0→max (lighter color, drawn first = behind)
          datasets.push({
            type: 'line' as const,
            label: multiInst ? label : `${param.label} (макс.)`,
            data: bks.map((b) => {
              const mx = b[maxKey] as number;
              return Math.abs(mx) >= 999 ? null : mx;
            }),
            borderColor: baseColor + '40',
            backgroundColor: baseColor + '30',
            borderWidth: 0,
            pointRadius: 0,
            tension: 0,
            fill: 'origin',
            spanGaps: true,
            order: 10 + origIdx,
          });
          // Min fill: 0→min (solid color, drawn on top)
          datasets.push({
            type: 'line' as const,
            label: multiInst ? `${label} (баз.)` : `${param.label} (баз.)`,
            data: bks.map((b) => {
              const mn = b[minKey] as number;
              return Math.abs(mn) >= 999 ? null : mn;
            }),
            borderColor: baseColor,
            backgroundColor: baseColor + 'aa',
            borderWidth: 0,
            pointRadius: 0,
            tension: 0,
            fill: 'origin',
            spanGaps: true,
            order: 5 + origIdx,
          });
        } else {
          // Other params: line chart showing MAX value
          datasets.push({
            type: 'line' as const,
            label,
            data: bks.map((b) => {
              const mx = b[maxKey] as number;
              return Math.abs(mx) >= 999 ? null : mx;
            }),
            borderColor: baseColor,
            backgroundColor: baseColor + '22',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.1,
            fill: false,
            spanGaps: true,
            borderDash: multiInst ? INST_DASH[origIdx % INST_DASH.length] : [],
          });
        }
      });
    });
    return datasets;
  }, [instName]);

  // Memoized chart data objects — prevents re-creation during slider drag
  const combinedChartData = useMemo(() => ({
    labels: aggLabels,
    datasets: buildAggDatasets(activeParams, instrumentIds.filter((id) => activeInstruments.includes(id)), aggByInstrument),
  }), [aggLabels, activeParams, instrumentIds, activeInstruments, aggByInstrument, buildAggDatasets]);

  const separateChartData = useMemo(() => {
    const filteredInstIds = instrumentIds.filter((id) => activeInstruments.includes(id));
    return Object.fromEntries(activeParams.map((key) => [
      key, { labels: aggLabels, datasets: buildAggDatasets([key], filteredInstIds, aggByInstrument) },
    ]));
  }, [aggLabels, activeParams, instrumentIds, activeInstruments, aggByInstrument, buildAggDatasets]);

  // When zoom/pan completes, map visible category range → time range → re-fetch
  const handleZoomPanComplete = useCallback(({ chart }: { chart: ChartJS }) => {
    const scale = chart.scales['x'];
    if (!scale || !timeMin || !timeMax) return;
    const ts = aggTimestamps.current;
    if (ts.length === 0) return;
    const minIdx = Math.max(0, Math.floor(scale.min));
    const maxIdx = Math.min(ts.length - 1, Math.ceil(scale.max));
    const visMin = ts[minIdx];
    const visMax = ts[maxIdx];
    const tMin = new Date(timeMin).getTime();
    const dur = durationMs || 1;
    const newFrom = Math.max(0, Math.round(((visMin - tMin) / dur) * 100));
    const newTo = Math.min(100, Math.round(((visMax - tMin) / dur) * 100));
    if (newFrom === committedTimeRange[0] && newTo === committedTimeRange[1]) return;
    // Reset chart zoom first (data will refill full width after fetch)
    chart.resetZoom();
    setTimeRange([newFrom, newTo]);
    setCommittedTimeRange([newFrom, newTo]);
  }, [timeMin, timeMax, durationMs, committedTimeRange]);

  const aggChartOptions = (title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: true, position: 'top' as const, labels: { boxWidth: 14, font: { size: 11 } } },
      title: { display: !!title, text: title },
      filler: { propagate: true },
      zoom: {
        pan: { enabled: true, mode: 'x' as const, onPanComplete: handleZoomPanComplete },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x' as const,
          onZoomComplete: handleZoomPanComplete,
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 20, maxRotation: 45 } },
      y: {},
    },
  });

  // ── Table-mode datasets (kept from old code for table view) ──
  const tableLabels = useMemo(() => {
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

  const visibleParams = PARAMS.filter((p) => activeParams.includes(p.key));
  const totalPages = Math.max(1, Math.ceil(filteredTotal / perPage));

  const rangeFromLabel = timeMin
    ? fmtTime(new Date(new Date(timeMin).getTime() + (timeRange[0] / 100) * durationMs).toISOString())
    : '';
  const rangeToLabel = timeMin
    ? fmtTime(new Date(new Date(timeMin).getTime() + (timeRange[1] / 100) * durationMs).toISOString())
    : '';

  // ── Downloads ──
  const downloadAllChartsPng = () => {
    if (chartMode === 'combined' && combinedChartRef.current) {
      downloadChartPng(combinedChartRef as any, `chart_${selectedExpId}.png`);
    } else {
      // For separate mode, capture each canvas and stitch them
      const refs = separateChartRefs.current;
      const keys = activeParams.filter((k) => refs[k]);
      if (keys.length === 0) return;
      if (keys.length === 1) {
        const chart = refs[keys[0]];
        if (chart) {
          const url = chart.toBase64Image('image/png', 1);
          const a = document.createElement('a'); a.href = url; a.download = `chart_${keys[0]}_${selectedExpId}.png`; a.click();
        }
        return;
      }
      // Stitch multiple charts vertically
      const canvases = keys.map((k) => refs[k]!.canvas);
      const totalH = canvases.reduce((sum, c) => sum + c.height, 0);
      const maxW = Math.max(...canvases.map((c) => c.width));
      const offscreen = document.createElement('canvas');
      offscreen.width = maxW; offscreen.height = totalH;
      const ctx = offscreen.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, maxW, totalH);
      let y = 0;
      canvases.forEach((c) => { ctx.drawImage(c, 0, y); y += c.height; });
      offscreen.toBlob((blob) => {
        if (blob) downloadBlob(blob, `charts_${selectedExpId}.png`);
      });
    }
  };

  const downloadTableScreenshot = () => {
    const el = tableContainerRef.current;
    if (!el) return;
    // Use native canvas approach: render table to image via SVG foreignObject
    const html = el.outerHTML;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${el.scrollWidth}" height="${el.scrollHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Roboto,sans-serif;font-size:13px">${html}</div>
      </foreignObject>
    </svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, `table_${selectedExpId}.svg`);
  };

  const downloadCsv = () => {
    if (!selectedExpId) return;
    // Direct download from backend streaming CSV endpoint
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    const base = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:8080`
      : '';
    window.open(`${base}/experiments/${selectedExpId}/csv?token=${token}`, '_blank');
  };

  const hasAggData = aggBuckets.length > 0;

  return (
    <Box ref={chartContainerRef}>
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
            {viewMode === 'chart' && <> | {chartPtsRef.current}px</>}
          </Typography>
        )}

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
          {/* Controls bar */}
          <Paper sx={{ p: 1, mb: 1 }}>
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

            {durationMs > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 65, textAlign: 'right' }}>
                  {rangeFromLabel}
                </Typography>
                <Slider
                  value={timeRange}
                  onChange={(_, v) => setTimeRange(v as [number, number])}
                  onChangeCommitted={(_, v) => setCommittedTimeRange(v as [number, number])}
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

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              {viewMode === 'table' && (
                <>
                  <Typography variant="caption" color="text.secondary">Интервал:</Typography>
                  <ToggleButtonGroup value={intervalSec} exclusive size="small"
                    onChange={(_, v) => { if (v !== null) setIntervalSec(v); }}>
                    {availableIntervals.map((o) => (
                      <ToggleButton key={o.sec} value={o.sec} sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                        {o.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
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

              <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {total.toLocaleString()} строк
                  {measHz > 0 && <> | {measHz.toFixed(1)} Гц</>}
                </Typography>
                {viewMode === 'chart' && (
                  <MuiTooltip title="Скачать скриншот графиков">
                    <IconButton size="small" onClick={downloadAllChartsPng}><PhotoCameraIcon fontSize="small" /></IconButton>
                  </MuiTooltip>
                )}
                {viewMode === 'table' && (
                  <>
                    <MuiTooltip title="Скачать скриншот таблицы (SVG)">
                      <IconButton size="small" onClick={downloadTableScreenshot}><PhotoCameraIcon fontSize="small" /></IconButton>
                    </MuiTooltip>
                    <MuiTooltip title="Скачать все замеры в CSV">
                      <IconButton size="small" onClick={downloadCsv}><DownloadIcon fontSize="small" /></IconButton>
                    </MuiTooltip>
                  </>
                )}
              </Box>
            </Stack>
          </Paper>

          {/* ── Chart view (aggregate) ── */}
          {hasAggData && viewMode === 'chart' && (
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
                  <Chart
                    ref={combinedChartRef as any}
                    type="line"
                    data={combinedChartData}
                    options={aggChartOptions('')}
                  />
                </Paper>
              ) : (
                <Stack spacing={1.5}>
                  {activeParams.map((key) => {
                    const param = PARAMS.find((p) => p.key === key)!;
                    return (
                      <Paper key={key} sx={{ p: 1, height: { xs: 220, md: 300 } }}>
                        <Chart
                          ref={(ref: any) => { separateChartRefs.current[key] = ref ?? null; }}
                          type="line"
                          data={separateChartData[key] || { labels: [], datasets: [] }}
                          options={aggChartOptions(param.label)}
                        />
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </>
          )}

          {/* ── Table view ── */}
          {measurements.length > 0 && viewMode === 'table' && (
            <>
              <TableContainer ref={tableContainerRef} component={Paper} sx={{ maxHeight: { xs: 400, md: 550 } }}>
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

          {/* Need to load table data when switching to table mode */}
          {viewMode === 'table' && measurements.length === 0 && !loading && hasAggData && (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Button variant="outlined" onClick={fetchData}>Загрузить табличные данные</Button>
            </Paper>
          )}

          {!hasAggData && measurements.length === 0 && !error && (
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
