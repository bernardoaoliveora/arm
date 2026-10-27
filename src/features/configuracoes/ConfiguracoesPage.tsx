import React, { useState } from 'react';
import { CheckCircle2, XCircle, Scale } from 'lucide-react';
import { Card, Button, Table, Badge, Modal, Input, Alert } from '../../components/ui';

interface OcorrenciaPendente {
  id: string;
  data: string;
  tecnico: string;
  item: string;
  tipo: 'DANO' | 'PERDA';
  quantidade: string;
  justificativa: string;
}

export const ConfiguracoesPage: React.FC = () => {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaPendente[]>([
    {
      id: 'oc-1',
      data: '27/10/2026 10:00',
      tecnico: 'João da Silva',
      item: 'Furadeira Bosch #PAT-0042',
      tipo: 'DANO',
      quantidade: '1 un',
      justificativa: 'Mandril quebrou durante furação de viga de concreto reforçado.',
    },
    {
      id: 'oc-2',
      data: '26/10/2026 17:30',
      tecnico: 'Marcos Souza',
      item: 'Alicate de Crimpar RJ45',
      tipo: 'PERDA',
      quantidade: '1 un',
      justificativa: 'Extraviado durante atendimento de emergência no subsolo do cliente.',
    },
  ]);

  const [selectedOcorrencia, setSelectedOcorrencia] = useState<OcorrenciaPendente | null>(null);
  const [isAprovarModalOpen, setIsAprovarModalOpen] = useState(false);
  const [parecer, setParecer] = useState('');
  const [isAjusteModalOpen, setIsAjusteModalOpen] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState('');

  const handleAprovar = () => {
    if (!selectedOcorrencia) return;
    setOcorrencias(ocorrencias.filter(o => o.id !== selectedOcorrencia.id));
    setIsAprovarModalOpen(false);
    setSucessoMsg(`Ocorrência de ${selectedOcorrencia.tipo} aprovada com sucesso. A baixa definitiva e o registro de auditoria foram gerados.`);
    setSelectedOcorrencia(null);
  };

  const handleRejeitar = () => {
    if (!selectedOcorrencia) return;
    setOcorrencias(ocorrencias.filter(o => o.id !== selectedOcorrencia.id));
    setIsAprovarModalOpen(false);
    setSucessoMsg(`Ocorrência rejeitada. O item retornou à custódia do técnico sob apuração.`);
    setSelectedOcorrencia(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Central de Governança e Aprovações</h1>
          <p style={{ marginTop: '2px' }}>
            Deliberação sobre perdas e danos relatados em campo e execução de ajustes autorizados.
          </p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Scale size={16} />}
          onClick={() => setIsAjusteModalOpen(true)}
        >
          Ajuste Manual de Inventário
        </Button>
      </div>

      {sucessoMsg && (
        <Alert variant="success" title="Decisão Registrada">
          {sucessoMsg}
        </Alert>
      )}

      {/* Fila de Aprovação de Ocorrências */}
      <Card
        title="Fila de Ocorrências Pendentes de Aprovação"
        subtitle="Itens avariados ou extraviados aguardando parecer administrativo para baixa patrimonial definitiva"
      >
        <Table
          keyExtractor={(o) => o.id}
          data={ocorrencias}
          emptyTitle="Nenhuma ocorrência pendente"
          emptyDescription="Todas as solicitações de perda e dano do campo foram analisadas."
          columns={[
            {
              key: 'tipo',
              header: 'Tipo',
              render: (o) => (
                <Badge variant={o.tipo === 'DANO' ? 'warning' : 'danger'}>
                  {o.tipo === 'DANO' ? 'Avaria / Reparo' : 'Perda / Extravio'}
                </Badge>
              )
            },
            { key: 'data', header: 'Data do Relato' },
            { key: 'tecnico', header: 'Técnico Solicitante' },
            {
              key: 'item',
              header: 'Item Afetado',
              render: (o) => (
                <div>
                  <strong>{o.item}</strong>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Justificativa: "{o.justificativa}"
                  </div>
                </div>
              )
            },
            { key: 'quantidade', header: 'Qtd' },
            {
              key: 'acoes',
              header: 'Deliberação',
              align: 'right',
              render: (o) => (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedOcorrencia(o);
                    setIsAprovarModalOpen(true);
                  }}
                >
                  Avaliar
                </Button>
              )
            }
          ]}
        />
      </Card>

      {/* Modal de Avaliação de Ocorrência */}
      <Modal
        isOpen={isAprovarModalOpen}
        onClose={() => setIsAprovarModalOpen(false)}
        title="Avaliar Ocorrência de Campo"
        description="Aprovar efetuará a baixa contábil definitiva. Rejeitar devolverá a responsabilidade ao técnico."
        footerActions={
          <>
            <Button variant="danger" leftIcon={<XCircle size={14} />} onClick={handleRejeitar}>
              Rejeitar Baixa
            </Button>
            <Button variant="primary" leftIcon={<CheckCircle2 size={14} />} onClick={handleAprovar}>
              Aprovar Baixa Definitiva
            </Button>
          </>
        }
      >
        {selectedOcorrencia && (
          <div>
            <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
              <div><strong>Item:</strong> {selectedOcorrencia.item}</div>
              <div><strong>Técnico:</strong> {selectedOcorrencia.tecnico}</div>
              <div><strong>Justificativa Informada:</strong> "{selectedOcorrencia.justificativa}"</div>
            </div>

            <Input
              label="Parecer do Administrador / Despacho"
              placeholder="Ex: Deferido. Encaminhar para assistência técnica autorizada."
              value={parecer}
              onChange={(e) => setParecer(e.target.value)}
            />
          </div>
        )}
      </Modal>

      {/* Modal de Ajuste Manual de Inventário */}
      <Modal
        isOpen={isAjusteModalOpen}
        onClose={() => setIsAjusteModalOpen(false)}
        title="Ajuste Manual de Balanço (Auditoria Obrigatória)"
        description="Ajustes alteram o saldo contábil diretamente e geram registro inalterável de auditoria."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsAjusteModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              setIsAjusteModalOpen(false);
              setSucessoMsg('Ajuste de inventário registrado com trilha de auditoria.');
            }}>
              Gravar Ajuste
            </Button>
          </>
        }
      >
        <Alert variant="warning" title="Atenção à Governança">
          O ajuste manual de estoque requer justificativa detalhada e armazena os saldos anterior e posterior.
        </Alert>

        <form onSubmit={(e) => e.preventDefault()}>
          <Input label="Código SKU ou Nome do Produto" placeholder="Ex: CAB-UTP-CAT6" required />
          <Input label="Novo Saldo Físico Contado" type="number" required />
          <div className="form-group">
            <label className="form-label">Justificativa do Ajuste de Balanço *</label>
            <textarea className="textarea" rows={3} required placeholder="Explique o motivo da divergência encontrada na contagem..." />
          </div>
        </form>
      </Modal>
    </div>
  );
};
