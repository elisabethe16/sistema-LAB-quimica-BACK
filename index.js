const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/registrar', async (req, res) => {
    const { usuario, insumo, finalidade, quantidade } = req.body;
    const { data, error } = await supabase
        .from('movimentacoes')
        .insert([{ usuario, insumo, finalidade, quantidade }]);

    if (error) return res.status(400).json(error);
    res.status(200).json({ message: 'Sucesso!', data });
});

app.listen(process.env.PORT || 3000);
