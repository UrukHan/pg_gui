'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Tabs, Tab, Box,
    FormGroup, FormControlLabel, Checkbox, Stack, IconButton, Button
} from '@mui/material';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale,
    Legend, Tooltip, BarElement
} from 'chart.js';

// Регистрируем ядро ChartJS (zoom подключим динамически ниже)
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, BarElement);

interface Props {
    open: boolean;
    row: any;
    tableName: string;
    onClose: () => void;
}

// мягкие пастельные
function pastel(i: number) {
    const hue = (i * 97) % 360;
    return `hsl(${hue} 45% 72%)`;
}

export default function ChartsDialog({ open, row, onClose }: Props) {
    const [tab, setTab] = useState(0);

    // === ДИНАМИЧЕСКАЯ регистрация chartjs-plugin-zoom ТОЛЬКО на клиенте ===
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (typeof window === 'undefined') return;
            const mod = await import('chartjs-plugin-zoom');
            if (!mounted) return;
            // @ts-ignore
            ChartJS.register(mod.default || mod);
        })();
        return () => { mounted = false; };
    }, []);

    // ---- ЛИНИИ (моки) ----
    const labels = useMemo(() => Array.from({ length: 24 }, (_, i) => `t${i}`), []);
    const rawSeries = useMemo(() => ({
        A: labels.map((_, i) => Math.sin(i / 3) * 20 + 50 + (Math.random() * 6 - 3)),
        B: labels.map((_, i) => Math.cos(i / 4) * 15 + 40 + (Math.random() * 6 - 3)),
        C: labels.map((_, i) => (i % 7) * 5 + 10 + (Math.random() * 6 - 3)),
    }), [labels]);

    const seriesKeys = Object.keys(rawSeries) as Array<'A' | 'B' | 'C'>;
    const [visible, setVisible] = useState<Record<string, boolean>>({ A: true, B: true, C: true });
    const [color, setColor] = useState<Record<string, string>>({ A: pastel(0), B: pastel(1), C: pastel(2) });

    // Ctrl — ограничиваем зум/пан по X
    const [ctrl, setCtrl] = useState(false);
    useEffect(() => {
        const down = (e: KeyboardEvent) => e.key === 'Control' && setCtrl(true);
        const up = (e: KeyboardEvent) => e.key === 'Control' && setCtrl(false);
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);

    const lineData = useMemo(() => ({
        labels,
        datasets: seriesKeys
            .filter(k => visible[k])
            .map(k => ({
                label: `Series ${k}`,
                data: (rawSeries as any)[k],
                borderColor: color[k],
                backgroundColor: color[k],
                tension: 0.25,
                pointRadius: 0,
            })),
    }), [labels, rawSeries, visible, color, seriesKeys]);

    const lineOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
            legend: { display: false },
            zoom: {
                limits: { x: { min: 'original', max: 'original' }, y: { min: 'original', max: 'original' } },
                pan:  { enabled: true, mode: ctrl ? 'x' : 'xy' },
                zoom: { wheel: { enabled: true }, mode: ctrl ? 'x' : 'xy' }
            }
        },
        scales: { x: { ticks: { maxRotation: 0 } }, y: { beginAtZero: false } }
    }), [ctrl]);

    const colorPickers = useRef<Record<string, HTMLInputElement | null>>({ A: null, B: null, C: null });
    const openColorPicker = (key: string) => colorPickers.current[key]?.click();

    // ---- ГИСТОГРАММА (моки, Bar) ----
    const [histExpandedIdx, setHistExpandedIdx] = useState<number | null>(null);
    const baseBars = useMemo(() => ([
        { label: 'Green',  value: 42 },
        { label: 'Red',    value: 55 },
        { label: 'Orange', value: 38 },
    ]), []);
    const [baseColors, setBaseColors] = useState<string[]>([
        'hsl(135 45% 72%)', 'hsl(5 45% 72%)', 'hsl(30 45% 72%)'
    ]);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const expandedData = useMemo(() => months.map(() => Math.floor(Math.random() * 20) + 5), [histExpandedIdx]);

    const histogramData = useMemo(() => {
        if (histExpandedIdx === null) {
            return {
                labels: baseBars.map(b => b.label),
                datasets: [{ label: 'Total', data: baseBars.map(b => b.value), backgroundColor: baseColors, borderWidth: 0 }]
            };
        }
        return {
            labels: months,
            datasets: [{ label: baseBars[histExpandedIdx].label, data: expandedData, backgroundColor: baseColors[histExpandedIdx], borderWidth: 0 }]
        };
    }, [baseBars, baseColors, histExpandedIdx, expandedData]);

    const histogramOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_: any, elements: any[]) => {
            // клик работает ТОЛЬКО в наружной гистограмме
            if (histExpandedIdx !== null) return;
            if (!elements?.length) return;
            const idx = elements[0].index as number;
            setHistExpandedIdx(prev => (prev === idx ? null : idx));
        },
        plugins: {
            legend: { display: false },
            zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, mode: 'x' } }
        },
        scales: { x: { stacked: false }, y: { beginAtZero: true } },
    }), [histExpandedIdx]);

    // смена цвета базовых колонок
    const baseColorPickers = useRef<HTMLInputElement[]>([]);
    const openBaseColorPicker = (i: number) => baseColorPickers.current[i]?.click();
    const setBaseColor = (i: number, v: string) => setBaseColors(prev => prev.map((c, idx) => (idx === i ? v : c)));

    const lineChartRef = useRef<any>(null);
    const barChartRef  = useRef<any>(null);
    const resetZoom = useCallback(() => {
        try { lineChartRef.current?.resetZoom?.(); } catch {}
        try { barChartRef.current?.resetZoom?.(); } catch {}
    }, []);
    useEffect(() => { resetZoom(); }, [tab, resetZoom]);

    // ---- 3D CLUSTERS (визуализация кластеров) ----
    const mountRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open || tab !== 2 || !mountRef.current) return;
        let disposed = false;

        (async () => {
            const THREE = await import('three');
            const OC = await import('three/examples/jsm/controls/OrbitControls.js');
            // @ts-ignore
            const OrbitControls = OC.OrbitControls;

            const mount = mountRef.current!;
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 1000);
            camera.position.set(40, 40, 40);

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(mount.clientWidth, mount.clientHeight);
            mount.appendChild(renderer.domElement);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            scene.add(new THREE.AmbientLight(0xffffff, 0.9));
            scene.add(new THREE.AxesHelper(30));

            // кластера (моки)
            const mkCluster = (center:[number,number,number], count:number, color:number) => {
                const geom = new THREE.BufferGeometry();
                const positions:number[] = [];
                for (let i = 0; i < count; i++) {
                    positions.push(center[0]+(Math.random()-0.5)*8, center[1]+(Math.random()-0.5)*8, center[2]+(Math.random()-0.5)*8);
                }
                geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
                const mat = new THREE.PointsMaterial({ size: 0.6, color });
                scene.add(new THREE.Points(geom, mat));
            };
            mkCluster([10,10,10], 350, 0xff5555);
            mkCluster([-12,5,4], 300, 0x55ff88);
            mkCluster([3,-8,-9], 300, 0x5599ff);

            const onResize = () => {
                camera.aspect = mount.clientWidth / mount.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(mount.clientWidth, mount.clientHeight);
            };
            const obs = new ResizeObserver(onResize);
            obs.observe(mount);

            const loop = () => {
                if (disposed) return;
                controls.update();
                renderer.render(scene, camera);
                requestAnimationFrame(loop);
            };
            loop();

            return () => {
                disposed = true;
                obs.disconnect();
                if (renderer && renderer.domElement && renderer.domElement.parentNode === mount) {
                    mount.removeChild(renderer.domElement);
                }
                renderer.dispose();
            };
        })();

        return () => { /* cleanup внутри async */ };
    }, [open, tab]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
            <DialogTitle>Charts (row #{row?.id ?? '-'})</DialogTitle>
            <DialogContent sx={{ height: 640, display: 'flex', flexDirection: 'column' }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                    <Tab label="Lines" />
                    <Tab label="Histogram" />
                    <Tab label="3D Clusters" />
                </Tabs>

                {tab === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
                        <FormGroup row>
                            {(['A','B','C'] as const).map((k) => (
                                <Stack key={k} direction="row" alignItems="center" spacing={1} sx={{ mr: 2 }}>
                                    <FormControlLabel
                                        control={<Checkbox checked={!!visible[k]} onChange={(_, v) => setVisible(p => ({ ...p, [k]: v }))} />}
                                        label={`Series ${k}`}
                                    />
                                    <Box
                                        sx={{ width: 20, height: 20, borderRadius: '4px', bgcolor: color[k],
                                            border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer' }}
                                        onClick={() => colorPickers.current[k]?.click()}
                                        title="Change color"
                                    />
                                    <input
                                        ref={el => (colorPickers.current[k] = el)}
                                        type="color"
                                        value={color[k]}
                                        onChange={e => setColor(prev => ({ ...prev, [k]: e.target.value }))}
                                        style={{ display: 'none' }}
                                    />
                                </Stack>
                            ))}
                            <Box sx={{ flexGrow: 1 }} />
                            <IconButton onClick={resetZoom} title="Reset zoom">↺</IconButton>
                        </FormGroup>

                        <Box sx={{ flex: 1, minHeight: 300 }}>
                            <Line ref={lineChartRef} data={lineData as any} options={lineOptions as any} />
                        </Box>
                        <Box sx={{ fontSize: 12, opacity: 0.7 }}>
                            🖱 колесо — зум; Ctrl — зум/пан только по X; drag — пан.
                        </Box>
                    </Box>
                )}

                {tab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
                        {/* Плашки выбора базовых цветов */}
                        <Stack direction="row" spacing={2} alignItems="center">
                            {['Green', 'Red', 'Orange'].map((label, i) => (
                                <Stack key={label} direction="row" alignItems="center" spacing={1}>
                                    <Box sx={{ minWidth: 60 }}>{label}</Box>
                                    <Box
                                        sx={{ width: 20, height: 20, borderRadius: '4px', bgcolor: baseColors[i],
                                            border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer' }}
                                        onClick={() => openBaseColorPicker(i)}
                                        title="Change color"
                                    />
                                    <input
                                        ref={el => { if (el) baseColorPickers.current[i] = el; }}
                                        type="color"
                                        value={baseColors[i]}
                                        onChange={e => setBaseColor(i, e.target.value)}
                                        style={{ display: 'none' }}
                                    />
                                </Stack>
                            ))}
                            {/* Back — только в развёрнутом */}
                            <Box sx={{ flexGrow: 1 }} />
                            {histExpandedIdx !== null && (
                                <Button variant="outlined" onClick={() => setHistExpandedIdx(null)}>Back</Button>
                            )}
                        </Stack>

                        <Box sx={{ flex: 1, minHeight: 300 }}>
                            <Bar ref={barChartRef} data={histogramData as any} options={histogramOptions as any} />
                        </Box>
                        <Box sx={{ fontSize: 12, opacity: 0.7 }}>
                            Клик по колонке — развернуть/свернуть (только снаружи). Колесо — зум по X, drag — пан.
                        </Box>
                    </Box>
                )}

                {tab === 2 && (
                    <Box sx={{ mt: 1, height: 520, border: '1px solid #eee', borderRadius: 1 }}>
                        <Box ref={mountRef} sx={{ width:'100%', height:'100%' }} />
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}
