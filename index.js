const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Função utilitária para gravar ações no Histórico Geral
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

// ==================== SAÍDA DE INSUMO (COM ABATIMENTO DE ESTOQUE) ====================
app.post('/registrar-saida', async (req, res) => {
    const { usuario, insumo, finalidade, quantidade, usuario_responsavel } = req.body;

    // 1. Busca o insumo para verificar o estoque atual
    const { data: insumoObj, error: fetchErr } = await supabase.from('insumos_cadastrados').select('*').eq('nome', insumo).maybeSingle();
    
    if (fetchErr || !insumoObj) return res.status(404).json({ error: 'Insumo não encontrado no acervo.' });
    if (insumoObj.quantidade_estoque < quantidade) {
        return res.status(400).json({ error: `Estoque insuficiente! Disponível apenas: ${insumoObj.quantidade_estoque} ${insumoObj.unidade_medida}` });
    }

    // 2. Abate a quantidade do estoque do insumo
    const novoEstoque = insumoObj.quantidade_estoque - quantidade;
    await supabase.from('insumos_cadastrados').update({ quantidade_estoque: novoEstoque }).eq('id', insumoObj.id);

    // 3. Registra a movimentação de saída
    const { data, error } = await supabase.from('movimentacoes').insert([{ usuario, insumo, finalidade, quantidade }]);
    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico(
        'Saída de Insumo',
        `Saída de ${quantidade} ${insumoObj.unidade_medida} de [${insumo}] para o aluno/professor: ${usuario}. Estoque atualizado para: ${novoEstoque} ${insumoObj.unidade_medida}.`,
        usuario_responsavel
    );

    res.status(200).json({ message: 'Saída registrada com sucesso!', data });
});

// ==================== GERENCIAMENTO DE INSUMOS (CRUD) ====================
app.post('/insumos', async (req, res) => {
    const { nome, categoria, quantidade_estoque, unidade_medida, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('insumos_cadastrados').insert([{ nome, categoria, quantidade_estoque, unidade_medida }]);
    
    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Cadastro de Insumo', `Insumo [${nome}] adicionado à categoria [${categoria}] com ${quantidade_estoque} ${unidade_medida}.`, usuario_responsavel);
    res.status(200).json(data);
});

app.get('/insumos', async (req, res) => {
    const { data, error } = await supabase.from('insumos_cadastrados').select('*').order('nome', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

app.put('/insumos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, quantidade_estoque, unidade_medida, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('insumos_cadastrados').update({ nome, categoria, quantidade_estoque, unidade_medida }).eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Edição de Insumo', `Insumo ID ${id} atualizado para [${nome}], estoque: ${quantidade_estoque} ${unidade_medida}.`, usuario_responsavel);
    res.status(200).json({ message: 'Insumo atualizado!' });
});

app.delete('/insumos/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_responsavel } = req.query;
    const { error } = await supabase.from('insumos_cadastrados').delete().eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Exclusão de Insumo', `Insumo ID ${id} removido do sistema.`, usuario_responsavel);
    res.status(200).json({ message: 'Insumo removido!' });
});

// ==================== GERENCIAMENTO DE USUÁRIOS (CRUD) ====================
app.post('/usuarios', async (req, res) => {
    const { nome, login, senha, cargo, matricula, usuario_responsavel } = req.body;
    const { data, error } = await supabase.from('usuarios').insert([{ nome, login, senha, cargo, matricula }]);

    if (error) return res.status(400).json({ error: 'O login escolhido já está em uso.' });

    await registrarNoHistorico('Cadastro de Usuário', `Novo usuário cadastrado: ${nome} (Matrícula: ${matricula}).`, usuario_responsavel);
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

    await registrarNoHistorico('Edição de Usuário', `Usuário ID ${id} (${nome}) atualizado pelo administrador.`, usuario_responsavel);
    res.status(200).json({ message: 'Usuário atualizado!' });
});

app.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_responsavel } = req.query;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);

    if (error) return res.status(400).json({ error: error.message });

    await registrarNoHistorico('Exclusão de Usuário', `Usuário ID ${id} removido do sistema.`, usuario_responsavel);
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
