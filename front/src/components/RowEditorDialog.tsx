'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

interface Props {
    open: boolean;
    data: any;
    fields: { name: string; type: string }[];
    onClose: () => void;
    onSave: (data: any) => void;
}

const ASSET_FIELDS = new Set(['image_links', 'file_links']);
const notAsset = (name: string) => !ASSET_FIELDS.has(name);

export default function RowEditorDialog({ open, data, fields, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        if (data && data.id) {
            setFormData(data);
        } else {
            const initialData = fields.reduce((acc, field) => {
                if (field.name !== 'id') {
                    acc[field.name] = '';
                }
                return acc;
            }, {} as Record<string, string>);
            setFormData(initialData);
        }
    }, [data, fields]);


    const handleChange = (name: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSaveClick = () => {
        onSave(formData);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{data?.id ? 'Edit Row' : 'Add Row'}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fields.map(f => (
                    <TextField
                        key={f.name}
                        sx={{ mt: 2 }}
                        label={f.name}
                        value={formData[f.name] || ''}
                        onChange={(e) => handleChange(f.name, e.target.value)}
                    />
                ))}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleSaveClick}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
