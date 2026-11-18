const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
    cb(permitidos.includes(file.mimetype) ? null : new Error('Formato inválido. Use JPG, PNG ou WEBP.'), permitidos.includes(file.mimetype));
  }
});

async function registrarNoHistorico(acao, detalhes, usuario_responsavel) {
  const { error } = await supabase.from('historico').insert([{ acao, detalhes, usuario_responsavel }]);
  if (error) console.error('Erro ao gravar histórico:', error.message);
}
const senhaEhHash = (senha) => typeof senha === 'string' && /^\$2[aby]\$/.test(senha);
const validarSenha = (senha) => typeof senha === 'string' && senha.length >= 8;

app.post('/login', async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) return res.status(400).json({ error: 'Informe login e senha.' });
  const { data: usuario, error } = await supabase.from('usuarios').select('id,nome,login,senha,cargo').eq('login', login).maybeSingle();
  if (error || !usuario) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  let senhaValida = false;
  if (senhaEhHash(usuario.senha)) senhaValida = await bcrypt.compare(senha, usuario.senha);
  else senhaValida = usuario.senha === senha; // compatibilidade temporária com contas antigas
  if (!senhaValida) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });

  // Migra a senha antiga em texto puro para bcrypt no primeiro login bem-sucedido.
  if (!senhaEhHash(usuario.senha)) {
    const hash = await bcrypt.hash(senha, 12);
    const { error: updateError } = await supabase.from('usuarios').update({ senha: hash }).eq('id', usuario.id);
    if (updateError) console.error('Falha ao migrar hash da senha:', updateError.message);
  }
  await registrarNoHistorico('Login efetuado', `O usuário ${usuario.nome} acessou a plataforma.`, usuario.nome);
  res.status(200).json({ id: usuario.id, nome: usuario.nome, login: usuario.login, cargo: usuario.cargo });
});

app.post('/alterar-senha', async (req, res) => {
  const { usuario_id, login, senha_atual, nova_senha } = req.body || {};
  if (!usuario_id || !login || !senha_atual || !validarSenha(nova_senha)) {
    return res.status(400).json({ error: 'Dados inválidos. A nova senha deve ter pelo menos 8 caracteres.' });
  }
  const { data: usuario, error } = await supabase.from('usuarios').select('id,nome,login,senha').eq('id', usuario_id).eq('login', login).maybeSingle();
  if (error || !usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const valida = senhaEhHash(usuario.senha) ? await bcrypt.compare(senha_atual, usuario.senha) : usuario.senha === senha_atual;
  if (!valida) return res.status(401).json({ error: 'A senha atual está incorreta.' });
  const hash = await bcrypt.hash(nova_senha, 12);
  const { error: updateError } = await supabase.from('usuarios').update({ senha: hash }).eq('id', usuario.id);
  if (updateError) return res.status(400).json({ error: 'Não foi possível atualizar a senha.' });
  await registrarNoHistorico('Alteração de senha', `Senha alterada pelo usuário ${usuario.nome}.`, usuario.nome);
  return res.status(200).json({ message: 'Senha alterada com sucesso.' });
});

// Upload das imagens no Supabase Storage. Crie o bucket público "insumos-imagens".
app.post('/insumos/upload-imagem', upload.single('imagem'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem.' });
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[req.file.mimetype];
  const nomeArquivo = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('insumos-imagens').upload(nomeArquivo, req.file.buffer, {
    contentType: req.file.mimetype, upsert: false
  });
  if (error) return res.status(400).json({ error: /bucket not found/i.test(error.message) ? 'Bucket insumos-imagens não encontrado. Execute migration.sql no Supabase SQL Editor.' : `Falha no upload: ${error.message}` });
  const { data } = supabase.storage.from('insumos-imagens').getPublicUrl(nomeArquivo);
  res.status(201).json({ imagem_url: data.publicUrl });
});

app.post('/registrar-saida', async (req, res) => {
  const { usuario, insumo, finalidade, quantidade, usuario_responsavel } = req.body || {};
  const qtd = Number(quantidade);
  if (!usuario || !insumo || !Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'Informe usuário, insumo e quantidade válida.' });
  const { data: insumoObj, error: fetchErr } = await supabase.from('insumos_cadastrados').select('*').eq('nome', insumo).maybeSingle();
  if (fetchErr || !insumoObj) return res.status(404).json({ error: 'Insumo não encontrado no acervo.' });
  if (insumoObj.quantidade_estoque < qtd) return res.status(400).json({ error: `Estoque insuficiente! Disponível: ${insumoObj.quantidade_estoque} ${insumoObj.unidade_medida}` });
  const novoEstoque = insumoObj.quantidade_estoque - qtd;
  const { error: updateError } = await supabase.from('insumos_cadastrados').update({ quantidade_estoque: novoEstoque }).eq('id', insumoObj.id);
  if (updateError) return res.status(400).json({ error: updateError.message });
  const { data, error } = await supabase.from('movimentacoes').insert([{ usuario, insumo, finalidade, quantidade: qtd }]).select();
  if (error) {
    await supabase.from('insumos_cadastrados').update({ quantidade_estoque: insumoObj.quantidade_estoque }).eq('id', insumoObj.id);
    return res.status(400).json({ error: error.message });
  }
  await registrarNoHistorico('Saída de Insumo', `Saída de ${qtd} ${insumoObj.unidade_medida} de [${insumo}] para: ${usuario}.`, usuario_responsavel);
  res.status(200).json({ message: 'Saída registrada com sucesso!', data });
});

app.post('/insumos', async (req, res) => {
  const { nome, categoria, localizacao, quantidade_estoque, unidade_medida, usuario_responsavel, imagem_url, data_validade, sem_data_validade = true, quantidade_minima_alerta = 0 } = req.body || {};
  const qtd = Number(quantidade_estoque);
  const minimo = Number(quantidade_minima_alerta);
  if (!Number.isInteger(minimo) || minimo < 0) return res.status(400).json({ error: 'Quantidade mínima inválida.' });
  if (!nome || !categoria || !Number.isInteger(qtd) || qtd < 0) return res.status(400).json({ error: 'Preencha nome, categoria e quantidade válida.' });
  const { data, error } = await supabase.from('insumos_cadastrados').insert([{
    nome, categoria, localizacao, quantidade_estoque: qtd, unidade_medida,
    imagem_url: imagem_url || null, data_validade: sem_data_validade ? null : data_validade,
    sem_data_validade: Boolean(sem_data_validade), quantidade_minima_alerta: minimo
  }]).select();
  if (error) return res.status(400).json({ error: error.message });
  await registrarNoHistorico('Cadastro de Insumo', `Insumo [${nome}] adicionado em [${localizacao}].`, usuario_responsavel);
  res.status(200).json(data);
});

app.get('/insumos', async (_req, res) => {
  const { data, error } = await supabase.from('insumos_cadastrados').select('*').order('nome', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json(data);
});

app.put('/insumos/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, categoria, localizacao, quantidade_estoque, unidade_medida, usuario_responsavel, imagem_url, data_validade, sem_data_validade = true, quantidade_minima_alerta = 0 } = req.body || {};
  const minimo = Number(quantidade_minima_alerta);
  const qtd = Number(quantidade_estoque);
  if (!Number.isInteger(minimo) || minimo < 0 || !Number.isInteger(qtd) || qtd < 0) return res.status(400).json({ error: 'Quantidades inválidas.' });
  const { error } = await supabase.from('insumos_cadastrados').update({
    nome, categoria, localizacao, quantidade_estoque: qtd, unidade_medida,
    imagem_url: imagem_url || null, data_validade: sem_data_validade ? null : data_validade,
    sem_data_validade: Boolean(sem_data_validade), quantidade_minima_alerta: minimo
  }).eq('id', id);
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

app.post('/usuarios', async (req, res) => {
  const { nome, login, senha, cargo, matricula, usuario_responsavel, cargo_responsavel } = req.body || {};
  if (cargo_responsavel === 'Professor' && cargo === 'Admin') return res.status(403).json({ error: 'Acesso negado. Professores não possuem permissão para criar administradores.' });
  if (!nome || !login || !validarSenha(senha) || !cargo) return res.status(400).json({ error: 'Preencha os dados. A senha deve ter pelo menos 8 caracteres.' });
  const hash = await bcrypt.hash(senha, 12);
  const { error } = await supabase.from('usuarios').insert([{ nome, login, senha: hash, cargo, matricula }]);
  if (error) return res.status(400).json({ error: 'Não foi possível cadastrar. Verifique se o login já está em uso.' });
  await registrarNoHistorico('Cadastro de Usuário', `Novo usuário cadastrado: ${nome} com cargo [${cargo}].`, usuario_responsavel);
  res.status(200).json({ message: 'Usuário cadastrado.' });
});

app.get('/usuarios', async (_req, res) => {
  const { data, error } = await supabase.from('usuarios').select('id,nome,login,cargo,matricula').order('nome', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json(data);
});

app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, login, senha, cargo, matricula, usuario_responsavel } = req.body || {};
  const atualizacao = { nome, login, cargo, matricula };
  if (senha) {
    if (!validarSenha(senha)) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    atualizacao.senha = await bcrypt.hash(senha, 12);
  }
  const { error } = await supabase.from('usuarios').update(atualizacao).eq('id', id);
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

app.get('/historico', async (_req, res) => {
  const { data, error } = await supabase.from('historico').select('*').order('data_registro', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json(data);
});

app.get('/', (_req, res) => res.status(200).send('API Lab5S ativa.'));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Erro na requisição.' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
