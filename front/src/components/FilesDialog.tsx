'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogContent, DialogActions,
    Box, Button, Divider, IconButton, Tooltip, CircularProgress
} from '@mui/material';
import { Grid } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ImageIcon from '@mui/icons-material/Image';
import axios from 'axios';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;

interface Props {
    open: boolean;
    row: any;             // { id, image_links, file_links, ... }
    tableName: string;
    onClose: () => void;
}

type ImgItem  = { url: string; loading: boolean };
type FileItem = { url: string; loading: boolean };

// если бэк вернул относительный путь (/uploads/...), дополняем до полного
const resolveSrc = (u: string) => (u?.startsWith('/uploads') ? `${API_ROOT}${u}` : u || '');

// --- PG text[] parser: '{"a","b"}' | '{/x,/y}' | '[]' | '["a","b"]' | string[] -> string[]
function parsePgTextArray(input: unknown): string[] {
    if (!input) return [];
    // уже массив?
    if (Array.isArray(input)) {
        return input.filter(Boolean).map(String);
    }
    if (typeof input !== 'string') return [];

    const s = input.trim();
    if (!s) return [];

    // JSON-массив?
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
        } catch {
            // fallthrough
        }
    }

    // PG-массив?
    if (s.startsWith('{') && s.endsWith('}')) {
        const inner = s.slice(1, -1); // без {}
        if (!inner) return [];

        const res: string[] = [];
        let buf = '';
        let inQuotes = false;

        for (let i = 0; i < inner.length; i++) {
            const ch = inner[i];
            if (inQuotes) {
                if (ch === '\\' && i + 1 < inner.length) { // экранирование
                    buf += inner[i + 1];
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    buf += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    if (buf.length) res.push(buf);
                    buf = '';
                } else {
                    buf += ch;
                }
            }
        }
        if (buf.length) res.push(buf);

        return res.map(x => x.trim()).filter(Boolean);
    }

    // одиночное значение (например, '/uploads/one.jpg')
    return [s];
}

export default function FilesDialog({ open, row, tableName, onClose }: Props) {
    const [images, setImages] = useState<ImgItem[]>([]);
    const [files,  setFiles]  = useState<FileItem[]>([]);
    const [deleteMode, setDeleteMode] = useState(false);

    const imgInputRef  = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // первичная инициализация из props.row (если бэк уже прислал их в этом объекте)
    useEffect(() => {
        const imgs = parsePgTextArray(row?.image_links).map(u => ({ url: String(u), loading: false }));
        const fls  = parsePgTextArray(row?.file_links ).map(u => ({ url: String(u), loading: false }));
        setImages(imgs);
        setFiles(fls);
        setDeleteMode(false);
    }, [row]);

    // при ОТКРЫТИИ окна — догружаем актуальные данные c бэка
    useEffect(() => {
        let cancelled = false;
        const fetchFresh = async () => {
            if (!open || !tableName || row?.id == null) return;
            try {
                const res = await axios.get(`${API_ROOT}/schema/${encodeURIComponent(tableName)}`);
                const rows: any[] = res.data?.rows ?? [];
                const fresh = rows.find(r => String(r.id) == String(row.id));
                if (!fresh) return;

                const imgs = parsePgTextArray(fresh.image_links).map((u: string) => ({ url: u, loading: false }));
                const fls  = parsePgTextArray(fresh.file_links ).map((u: string) => ({ url: u, loading: false }));

                if (!cancelled) {
                    setImages(imgs);
                    setFiles(fls);
                }
            } catch {
                // молча — у нас уже есть локальное состояние
            }
        };
        fetchFresh();
        return () => { cancelled = true; };
    }, [open, tableName, row?.id]);

    // загрузка изображения с плейсхолдером
    const uploadImage = async (file: File) => {
        const idx = images.length;
        setImages(prev => [...prev, { url: '', loading: true }]);

        const form = new FormData();
        form.append('file', file);
        try {
            const res = await axios.post(
                `${API_ROOT}/upload/${encodeURIComponent(tableName)}/${encodeURIComponent(row.id)}/image`,
                form, { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            const path: string = res.data?.path; // "/uploads/.."
            setImages(prev => prev.map((it, i) => i === idx ? ({ url: path, loading: false }) : it));
        } catch {
            setImages(prev => prev.filter((_, i) => i !== idx));
        }
    };

    // загрузка файла с плейсхолдером
    const uploadFile = async (file: File) => {
        const idx = files.length;
        setFiles(prev => [...prev, { url: 'Uploading...', loading: true }]);

        const form = new FormData();
        form.append('file', file);
        try {
            const res = await axios.post(
                `${API_ROOT}/upload/${encodeURIComponent(tableName)}/${encodeURIComponent(row.id)}/file`,
                form, { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            const path: string = res.data?.path;
            setFiles(prev => prev.map((it, i) => i === idx ? ({ url: path, loading: false }) : it));
        } catch {
            setFiles(prev => prev.filter((_, i) => i !== idx));
        }
    };

    // удаление
    const removeImage = async (idx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const path = images[idx]?.url;
        if (!path) return;
        try {
            await axios.delete(`${API_ROOT}/upload/${encodeURIComponent(tableName)}/${encodeURIComponent(row.id)}/image`, { data: { path } });
            setImages(prev => prev.filter((_, i) => i !== idx));
        } catch {}
    };
    const removeFile = async (idx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const path = files[idx]?.url;
        if (!path) return;
        try {
            await axios.delete(`${API_ROOT}/upload/${encodeURIComponent(tableName)}/${encodeURIComponent(row.id)}/file`, { data: { path } });
            setFiles(prev => prev.filter((_, i) => i !== idx));
        } catch {}
    };

    const onImagesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) uploadImage(f);
        e.target.value = '';
    };
    const onFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) uploadFile(f);
        e.target.value = '';
    };

    const handleContentClick = () => { if (deleteMode) setDeleteMode(false); };
    const handleContextMenu: React.MouseEventHandler = (e) => { e.preventDefault(); if (deleteMode) setDeleteMode(false); };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
            <DialogContent sx={{ p: 0 }} onClick={handleContentClick} onContextMenu={handleContextMenu}>
                {/* Toolbar — одна строка: слева Delete/Load, справа Back */}
                <Box sx={{ p: 1, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* левая группа */}
                    <Tooltip title={deleteMode ? 'Exit delete mode' : 'Delete'}>
                        <Button
                            onClick={(e) => { e.stopPropagation(); setDeleteMode(m => !m); }}
                            variant={deleteMode ? 'contained' : 'outlined'}
                            color={deleteMode ? 'error' : 'inherit'}
                            startIcon={<DeleteOutlineIcon />}
                            sx={{
                                borderColor: deleteMode ? 'error.main' : 'text.secondary',
                                color: deleteMode ? 'error.contrastText' : 'text.primary'
                            }}
                        >
                            Delete
                        </Button>
                    </Tooltip>

                    <Button
                        variant="outlined"
                        onClick={(e) => { e.stopPropagation(); imgInputRef.current?.click(); }}
                        sx={{
                            borderColor: 'success.main', color: 'success.main',
                            '&:hover': { borderColor: 'success.dark', color: 'success.dark' }
                        }}
                    >
                        Load Image
                    </Button>

                    <Button
                        variant="outlined"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        sx={{
                            borderColor: 'info.main', color: 'info.main',
                            '&:hover': { borderColor: 'info.dark', color: 'info.dark' }
                        }}
                    >
                        Load File
                    </Button>

                    {/* гибкий спейсер */}
                    <Box sx={{ flexGrow: 1 }} />

                    {/* правая кнопка, прижата к правому краю */}
                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        sx={{
                            borderColor: 'secondary.main', color: 'secondary.main',
                            '&:hover': { borderColor: 'secondary.dark', color: 'secondary.dark' }
                        }}
                    >
                        Back
                    </Button>

                    <input ref={imgInputRef} hidden type="file" accept="image/*" onChange={onImagesPick} />
                    <input ref={fileInputRef} hidden type="file" onChange={onFilesPick} />
                </Box>

                {/* Content */}
                <Box sx={{ display: 'flex', height: 520 }}>
                    {/* IMAGES — Grid 3 колонки на md+, 1 на xs */}
                    <Box sx={{ width: '55%', p: 2, overflow: 'auto' }}>
                        <Grid container spacing={1}>
                            {images.length === 0 ? (
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <Box sx={{
                                        height: 160,
                                        border: '1px dashed rgba(0,0,0,0.2)',
                                        borderRadius: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0.6
                                    }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <ImageIcon fontSize="large" />
                                            <Box sx={{ mt: 1, fontSize: 13 }}>No images yet</Box>
                                        </Box>
                                    </Box>
                                </Grid>
                            ) : null}

                            {images.map((item, i) => (
                                <Grid key={`${item.url || 'loading'}-${i}`} size={{ xs: 12, md: 4 }}>
                                    <Box sx={{ position: 'relative', width: '100%' }}>
                                        {item.loading ? (
                                            <Box sx={{
                                                height: 160, borderRadius: 1, border: '1px solid rgba(0,0,0,0.08)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                bgcolor: 'rgba(0,0,0,0.02)'
                                            }}>
                                                <CircularProgress size={22} sx={{ mr: 1 }} />
                                                <ImageIcon sx={{ opacity: 0.6 }} />
                                            </Box>
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={resolveSrc(item.url)}
                                                alt={`img-${i}`}
                                                loading="lazy"
                                                style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block' }}
                                            />
                                        )}

                                        {deleteMode && !item.loading && (
                                            <IconButton
                                                aria-label="delete image"
                                                size="small"
                                                onClick={(e) => removeImage(i, e)}
                                                sx={{
                                                    position: 'absolute', right: 6, top: 6,
                                                    bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                                                }}
                                            >
                                                <DeleteForeverIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>

                    <Divider flexItem orientation="vertical" />

                    {/* FILES — текст (ellipsis) + колонка корзины */}
                    <Box sx={{ width: '45%', p: 2, overflow: 'auto' }}>
                        {files.length === 0 ? (
                            <Box sx={{ opacity: 0.6 }}>No files yet</Box>
                        ) : (
                            <Grid container spacing={1}>
                                {files.map((f, i) => (
                                    <Grid key={`${f.url}-${i}`} size={{ xs: 12 }}>
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr auto',
                                                alignItems: 'center',
                                                gap: 1,
                                                border: '1px solid rgba(0,0,0,0.08)',
                                                borderRadius: 1,
                                                p: 1
                                            }}
                                        >
                                            <Box
                                                sx={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                title={f.loading ? 'Uploading...' : f.url}
                                            >
                                                {f.loading ? 'Uploading...' : (f.url.split('/').pop() || f.url)}
                                            </Box>
                                            <Box>
                                                {deleteMode && !f.loading && (
                                                    <IconButton aria-label="delete file" onClick={(e) => removeFile(i, e)}>
                                                        <DeleteForeverIcon />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </Box>
                                    </Grid>
                                ))}
                            </Grid>
                        )}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions />
        </Dialog>
    );
}
