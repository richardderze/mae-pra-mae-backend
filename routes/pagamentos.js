const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

// Listar pagamentos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { parceiroId, pago } = req.query;
    
    const where = {};
    
    // Se for parceiro, só mostra seus pagamentos
    if (req.usuario.tipo === 'parceiro') {
      where.parceiroId = req.usuario.parceiroId;
    } else if (parceiroId) {
      where.parceiroId = parseInt(parceiroId);
    }
    
    if (pago !== undefined) {
      where.pago = pago === 'true';
    }

    const pagamentos = await prisma.pagamento.findMany({
      where,
      include: {
        venda: {
          include: {
            peca: {
              include: {
                marca: true,
                tamanho: true
              }
            }
          }
        },
        parceiro: {
          include: {
            usuario: {
              select: {
                nome: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        criadoEm: 'desc'
      }
    });

    res.json(pagamentos);
  } catch (erro) {
    console.error('Erro ao listar pagamentos:', erro);
    res.status(500).json({ erro: 'Erro ao listar pagamentos' });
  }
});

// Obter pagamentos pendentes de um parceiro
router.get('/pendentes/:parceiroId', authMiddleware, async (req, res) => {
  try {
    const { parceiroId } = req.params;
    
    // Parceiros só podem ver seus próprios pagamentos
    if (req.usuario.tipo === 'parceiro' && req.usuario.parceiroId !== parseInt(parceiroId)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const pagamentosPendentes = await prisma.pagamento.findMany({
      where: {
        parceiroId: parseInt(parceiroId),
        pago: false
      },
      include: {
        venda: {
          include: {
            peca: {
              include: {
                marca: true,
                tamanho: true
              }
            }
          }
        }
      },
      orderBy: {
        criadoEm: 'asc'
      }
    });

    const totalPendente = pagamentosPendentes.reduce((acc, p) => acc + p.valorParceiro, 0);

    res.json({
      pagamentos: pagamentosPendentes,
      total: totalPendente,
      quantidade: pagamentosPendentes.length
    });
  } catch (erro) {
    console.error('Erro ao obter pagamentos pendentes:', erro);
    res.status(500).json({ erro: 'Erro ao obter pagamentos pendentes' });
  }
});

// Marcar pagamentos como pagos (pode ser múltiplos)
router.post('/marcar-pago', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { pagamentoIds, dataPagamento, observacoes } = req.body;

    if (!pagamentoIds || !Array.isArray(pagamentoIds) || pagamentoIds.length === 0) {
      return res.status(400).json({ erro: 'Lista de pagamentos inválida' });
    }

    const pagamentosAtualizados = await prisma.pagamento.updateMany({
      where: {
        id: { in: pagamentoIds.map(id => parseInt(id)) }
      },
      data: {
        pago: true,
        dataPagamento: dataPagamento ? new Date(dataPagamento) : new Date(),
        observacoes
      }
    });

    res.json({ 
      mensagem: 'Pagamentos marcados como pagos',
      quantidade: pagamentosAtualizados.count
    });
  } catch (erro) {
    console.error('Erro ao marcar pagamentos:', erro);
    res.status(500).json({ erro: 'Erro ao marcar pagamentos' });
  }
});

// Gerar dados para recibo de pagamento
router.get('/recibo/:parceiroId', authMiddleware, async (req, res) => {
  try {
    const { parceiroId } = req.params;
    const { pagamentoIds } = req.query;
    
    // Parceiros só podem gerar seus próprios recibos
    if (req.usuario.tipo === 'parceiro' && req.usuario.parceiroId !== parseInt(parceiroId)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const where = {
      parceiroId: parseInt(parceiroId)
    };

    // Se IDs específicos forem fornecidos
    if (pagamentoIds) {
      const ids = pagamentoIds.split(',').map(id => parseInt(id));
      where.id = { in: ids };
    }

    const pagamentos = await prisma.pagamento.findMany({
      where,
      include: {
        venda: {
          include: {
            peca: {
              include: {
                marca: true,
                tamanho: true
              }
            }
          }
        },
        parceiro: {
          include: {
            usuario: {
              select: {
                nome: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        criadoEm: 'asc'
      }
    });

    if (pagamentos.length === 0) {
      return res.status(404).json({ erro: 'Nenhum pagamento encontrado' });
    }

    const totalPago = pagamentos
      .filter(p => p.pago)
      .reduce((acc, p) => acc + p.valorParceiro, 0);
    
    const totalPendente = pagamentos
      .filter(p => !p.pago)
      .reduce((acc, p) => acc + p.valorParceiro, 0);

    const recibo = {
      parceiro: {
        id: pagamentos[0].parceiro.id,
        nome: pagamentos[0].parceiro.usuario.nome,
        email: pagamentos[0].parceiro.usuario.email,
        telefone: pagamentos[0].parceiro.telefone,
        percentual: pagamentos[0].parceiro.percentual
      },
      pagamentos: pagamentos.map(p => ({
        id: p.id,
        peca: {
          codigo: p.venda.peca.codigoEtiqueta,
          marca: p.venda.peca.marca.nome,
          tamanho: p.venda.peca.tamanho.nome
        },
        dataVenda: p.venda.dataVenda,
        valorVendido: p.venda.valorVendido,
        percentual: p.percentual,
        valorParceiro: p.valorParceiro,
        pago: p.pago,
        dataPagamento: p.dataPagamento
      })),
      totais: {
        totalPago,
        totalPendente,
        total: totalPago + totalPendente,
        quantidadePecas: pagamentos.length
      },
      dataGeracao: new Date()
    };

    res.json(recibo);
  } catch (erro) {
    console.error('Erro ao gerar recibo:', erro);
    res.status(500).json({ erro: 'Erro ao gerar recibo' });
  }
});

// Atualizar observações de um pagamento
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes } = req.body;

    const pagamento = await prisma.pagamento.update({
      where: { id: parseInt(id) },
      data: { observacoes }
    });

    res.json(pagamento);
  } catch (erro) {
    console.error('Erro ao atualizar pagamento:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar pagamento' });
  }
});

module.exports = router;
