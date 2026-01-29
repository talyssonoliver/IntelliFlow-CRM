### 3.2 Roteamento Automático de Ticket (skills-based)

**Cenário**: Ticket categorizado precisa ser direcionado ao agente mais
qualificado.

**Especificações Técnicas**:

```yaml
id: FLOW-012
name: Roteamento Automático de Tickets
category: Relacionamento e Suporte
priority: High
sprint: 5

actors:
  - Sistema de Roteamento
  - Agente de Suporte
  - Supervisor
  - Sistema de IA

pre_conditions:
  - Ticket categorizado
  - Agentes disponíveis
  - Skills matrix atualizado
  - Capacidade de carga balanceada

flow_steps:
  1_agent_availability_check:
    description: "Verificação de disponibilidade"
    real_time_status:
      - Online/offline status
      - Current workload
      - Break/schedule status
      - Skill availability
      - Language proficiency
    capacity_management:
      - Concurrent ticket limits
      - Daily/hourly quotas
      - Performance metrics
      - Fatigue monitoring
      - Training status
    artifacts:
      - apps/api/src/services/agent-availability.service.ts
      - apps/api/src/models/agent-capacity.model.ts
      - apps/web/components/agent/status-indicator.tsx

  2_skill_matching_algorithm:
    description: "Algoritmo de matching de skills"
    skill_assessment:
      - Technical expertise levels
      - Product knowledge depth
      - Language capabilities
      - Customer type experience
      - Industry specialization
    ticket_complexity:
      - Technical difficulty
      - Business impact
      - Time sensitivity
      - Customer importance
      - Resolution requirements
    matching_logic:
      - Primary skill match (required)
      - Secondary skill bonus
      - Experience level consideration
      - Load balancing factor
      - Performance history
    artifacts:
      - apps/api/src/services/skill-matcher.service.ts
      - apps/api/src/models/skill-matrix.model.ts
      - apps/ai-worker/src/algorithms/skill-matching.algo.ts

  3_routing_execution:
    description: "Execução do roteamento"
    immediate_assignment:
      - Direct agent notification
      - Ticket status update
      - SLA clock start
      - Customer notification
      - Queue position update
    overflow_handling:
      - Supervisor escalation
      - Team queue distribution
      - External vendor routing
      - Callback scheduling
      - Self-service redirection
    re_routing_capability:
      - Manual re-assignment
      - Skill gap identification
      - Training recommendations
      - Process improvement
      - Quality feedback
    artifacts:
      - apps/api/src/services/ticket-router.service.ts
      - apps/api/src/events/ticket-assigned.event.ts
      - apps/web/components/tickets/assignment-notifications.tsx

  4_load_balancing:
    description: "Balanceamento de carga"
    distribution_strategies:
      - Round-robin rotation
      - Weighted by performance
      - Skill-based distribution
      - Geographic routing
      - Time-zone alignment
    workload_monitoring:
      - Real-time metrics
      - Historical patterns
      - Peak time adjustments
      - Seasonal variations
      - Emergency overrides
    fairness_algorithms:
      - Equal opportunity
      - Merit-based weighting
      - Learning from success
      - Feedback incorporation
      - Continuous optimization
    artifacts:
      - apps/api/src/services/load-balancer.service.ts
      - apps/api/src/metrics/workload-metrics.ts
      - apps/web/components/dashboard/load-distribution.tsx

edge_cases:
  - no_matching_agent: "Escalation to supervisor queue"
  - agent_overloaded: "Load shedding to backup agents"
  - skill_gap_identified: "Training ticket creation"
  - emergency_situations: "Priority override routing"
  - agent_unavailable: "Callback scheduling system"

technical_artifacts:
  algorithms:
    - matching: Cosine similarity + ML ranking
    - balancing: Weighted round-robin + predictive
    - optimization: Reinforcement learning

  performance:
    - routing_time: <500ms
    - match_accuracy: >90%
    - load_distribution: ±5% variance

  monitoring:
    - agent_utilization: Real-time tracking
    - ticket_velocity: SLA compliance
    - customer_wait_time: Queue metrics

success_metrics:
  - first_contact_resolution: >70%
  - average_handle_time: <15min
  - customer_satisfaction: >4.5/5
  - agent_satisfaction: >4.0/5
```

**Cenário**: Henrique, supervisor, configurou roteamento inteligente para 50
agentes.

**Passos Detalhados**:

```yaml
1. Análise do Ticket:
  - Categoria e subcategoria
  - Produto mencionado
  - Complexidade estimada
  - Idioma detectado
  - SLA priority

2. Skills Matching:
  - Agentes disponíveis
  - Skills vs. requirements
  - Workload atual
  - Performance histórica
  - Timezone match

3. Algoritmo de Decisão:
  - Score por agente
  - Balanceamento carga
  - Afinidade (atendeu antes?)
  - Especialização
  - Disponibilidade

4. Atribuição:
  - Agente selecionado
  - Notificação push
  - Ticket aparece na fila
  - Timer SLA inicia

5. Fallback:
  - Sem match → Supervisor
  - Timeout → Escalation
  - Recusa → Re-route
```

**Edge Cases**:

- Todos ocupados → Overflow queue
- Skills não encontradas → Training flag
- VIP customer → Priority override

**Sistemas**:

- `apps/api/src/routing/skills-engine.ts`
- `apps/api/src/tickets/assignment.service.ts`
- Redis queue management
