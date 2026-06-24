const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function registrarNoHistorico(acao, detalhes, usuario_responsavel) {
    try {
        await supabase.from('historico').insert([{ acao, detalhes, usuario_responsavel }]);
    } catch (err) {
        console.error('Erro ao gravar histórico:', err);
    }
}

// ==================== AUTENTICAÇÃO (LOGIN) ====================
app.post('/login', async (req, res) => {
    const { login, senha } = req.body;
    const { data, error } = await supabase.from('usuarios').select('*').eq('login', login).eq('senha', senha).maybeSingle();

    if (error || !data) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

    await registrarNoHistorico('Login efetuado', `O usuário ${data.nome} acessou a plataforma.`, data.nome);
    res.status(200).json({ id: data.id, nome: data.nome, cargo: data.cargo });
});

// ==================== SAÍDA DE INSUMO ====================
app.post('/registrar-saida', async (req, res) => {
    const { usuario, insumo, finalidade, quantidade, usuario_responsavel } = req.body;

    const { data: insumoObj, error: fetchErr } = await supabase.from('insumos_cadastrados').select('*').eq('nome', insumo).maybeSingle();
    
    if (fetchErr || !insumoObj) return res.status(404).json({ error: 'Insumo não encontrado no acervo.' });
    if (insumoObj.quantidade_estoque < quantidade) {
        return res.status(400).json({ error: `Estoque insuficiente! Disponível: ${insumoObj.quantidade_estoque} ${insumoObj.unidade_medida}` });
    }

    const novoEstoque = insumoObj.quantidade_estoque - quantitative;
    await supabase.from('insumos_cadastrados').update({ quantidade_estoque: novoEstoque }).eq('id', insumoObj.id);

    const { data, error } = await supabase.from('movimentacoes').insert([{ usuario, insumo, finalidade, quantidade }]);
    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico(
        'Saída de Insumo',
        `Saída de ${quantidade} ${insumoObj.unidade_medida} de [${insumo}] para: ${usuario}.`,
        usuario_responsavel
    );

    res.status(200).json({ message: 'Saída registrada com sucesso!', data });
});

// ==================== GERENCIAMENTO DE INSUMOS ====================
app.post('/insumos', async (req, res) => {
    const { nome, categoria, localizacao, quantidade_estoque, unidade_medida, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('insumos_cadastrados').insert([{ nome, categoria, localizacao, quantidade_estoque, unidade_medida }]);
    
    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Cadastro de Insumo', `Insumo [${nome}] adicionado em [${localizacao}].`, usuario_responsavel);
    res.status(200).json(data);
});

app.get('/insumos', async (req, res) => {
    const { data, error } = await supabase.from('insumos_cadastrados').select('*').order('nome', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

app.put('/insumos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, localizacao, quantidade_estoque, unidade_medida, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('insumos_cadastrados').update({ nome, categoria, localizacao, quantidade_estoque, unidade_medida }).eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Edição de Insumo', `Insumo ID ${id} atualizado para [${nome}].`, usuario_responsavel);
    res.status(200).json({ message: 'Insumo atualizado!' });
});

app.delete('/insumos/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_responsavel } = req.query;
    const { error } = await supabase.from('insumos_cadastrados').delete().eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Exclusão de Insumo', `Insumo ID ${id} removido do acervo.`, usuario_responsavel);
    res.status(200).json({ message: 'Insumo removido!' });
});

// ==================== GERENCIAMENTO DE USUÁRIOS ====================
app.post('/usuarios', async (req, res) => {
    const { nome, login, senha, cargo, matricula, usuario_responsavel, cargo_responsavel } = req.body;

    // VALIDAÇÃO HIERÁRQUICA: Professor não pode criar Admin ou Coordenador
    if (cargo_responsavel === 'Professor' && (cargo === 'Admin' || cargo === 'Coordenador')) {
        return res.status(403).json({ error: 'Acesso negado. Professores só podem criar contas de Alunos ou Professores.' });
    }

    const { data, error } = await supabase.from('usuarios').insert([{ nome, login, senha, cargo, matricula }]);
    if (error) return res.status(400).json({ error: 'O login escolhido já está em uso.' });

    await registrarNoHistorico('Cadastro de Usuário', `Novo usuário cadastrado: ${nome} com cargo [${cargo}].`, usuario_responsavel);
    res.status(200).json(data);
});

app.get('/usuarios', async (req, res) => {
    const { data, error } = await supabase.from('usuarios').select('*').order('nome', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

app.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, login, senha, cargo, matricula, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('usuarios').update({ nome, login, senha, cargo, matricula }).eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Edição de Usuário', `Usuário ID ${id} (${nome}) atualizado.`, usuario_responsavel);
    res.status(200).json({ message: 'Usuário atualizado!' });
});

app.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_responsavel } = req.query;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Exclusão de Usuário', `Usuário ID ${id} removido.`, usuario_responsavel);
    res.status(200).json({ message: 'Usuário removido!' });
});

// ==================== HISTÓRICO GERAL ====================
app.get('/historico', async (req, res) => {
    const { data, error } = await supabase.from('historico').select('*').order('data_registro', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
