'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import { Field } from './types';

interface Props {
    open: boolean;
    fields: Field[];
    onClose: () => void;
    onSave: (data: Record<string, any>) => void;
}

export default function AddRowDialog({ open, fields, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<Record<string, any>>({});

    useEffect(() => {
        const initialData = fields.reduce((acc, field) => {
            if (field.name !== 'id') {
                acc[field.name] = '';
            }
            return acc;
        }, {} as Record<string, string>);
        setFormData(initialData);
    }, [fields]);

    const handleChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveClick = () => {
        onSave(formData);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Add Row</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fields.filter(f => f.name !== 'id').map(f => (
                    <TextField
                        key={f.name}
                        sx={{ mt: 2 }}
                        label={f.name}
                        value={formData[f.name] ?? ''}
                        onChange={e => handleChange(f.name, e.target.value)}
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
