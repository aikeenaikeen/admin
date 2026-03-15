<script setup lang="ts">
import { useI18n } from 'vue-i18n'

type MetaValue = number | boolean | 'on_demand' | 'always'

interface FieldMeta {
  min?: number
  max?: number
  recommended: MetaValue
  options?: MetaValue[]
  descriptionKey: string
}

const props = withDefaults(
  defineProps<{
    config: Record<string, any>
    showAdvanced: boolean
    withDivider?: boolean
  }>(),
  {
    withDivider: false,
  }
)

const emit = defineEmits<{
  (e: 'update:showAdvanced', value: boolean): void
}>()

const { t } = useI18n()

const fieldMeta: Readonly<Record<string, FieldMeta>> = {
  peopleTracking: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.peopleTracking',
  },
  observationMode: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.observationMode',
  },
  personDetectionMode: {
    recommended: 'on_demand',
    options: ['on_demand', 'always'],
    descriptionKey: 'companies.dialog.hints.personDetectionMode',
  },
  minFaceHeight: {
    min: 10,
    max: 200,
    recommended: 24,
    descriptionKey: 'companies.dialog.hints.minFaceHeight',
  },
  minBlur: {
    min: 0,
    max: 500,
    recommended: 45,
    descriptionKey: 'companies.dialog.hints.minBlur',
  },
  similarityThreshold: {
    min: 0,
    max: 1,
    recommended: 0.2,
    descriptionKey: 'companies.dialog.hints.similarityThreshold',
  },
  minMargin: {
    min: 0,
    max: 1,
    recommended: 0.03,
    descriptionKey: 'companies.dialog.hints.minMargin',
  },
  lowConfidenceExtra: {
    min: 0,
    max: 1,
    recommended: 0.08,
    descriptionKey: 'companies.dialog.hints.lowConfidenceExtra',
  },
  lowConfidenceMinMargin: {
    min: 0,
    max: 1,
    recommended: 0.06,
    descriptionKey: 'companies.dialog.hints.lowConfidenceMinMargin',
  },
  minEmbeddings: {
    min: 1,
    max: 10,
    recommended: 3,
    descriptionKey: 'companies.dialog.hints.minEmbeddings',
  },
  lowConfidenceExtraEmbeddings: {
    min: 0,
    max: 10,
    recommended: 2,
    descriptionKey: 'companies.dialog.hints.lowConfidenceExtraEmbeddings',
  },
  faceTrackMaxAgeSeconds: {
    min: 0.5,
    max: 10,
    recommended: 2.5,
    descriptionKey: 'companies.dialog.hints.faceTrackMaxAgeSeconds',
  },
  personDetectorConfidence: {
    min: 0,
    max: 1,
    recommended: 0.45,
    descriptionKey: 'companies.dialog.hints.personDetectorConfidence',
  },
  personIouThreshold: {
    min: 0,
    max: 1,
    recommended: 0.3,
    descriptionKey: 'companies.dialog.hints.personIouThreshold',
  },
  personTrackMaxAgeSeconds: {
    min: 0.5,
    max: 30,
    recommended: 6,
    descriptionKey: 'companies.dialog.hints.personTrackMaxAgeSeconds',
  },
  faceToPersonIouThreshold: {
    min: 0,
    max: 1,
    recommended: 0.02,
    descriptionKey: 'companies.dialog.hints.faceToPersonIouThreshold',
  },
  faceToPersonContainmentMin: {
    min: 0,
    max: 1,
    recommended: 0.45,
    descriptionKey: 'companies.dialog.hints.faceToPersonContainmentMin',
  },
  faceToPersonLooseContainmentMin: {
    min: 0,
    max: 1,
    recommended: 0.25,
    descriptionKey: 'companies.dialog.hints.faceToPersonLooseContainmentMin',
  },
  faceToPersonUpperBodyMaxYRatio: {
    min: 0,
    max: 1,
    recommended: 0.72,
    descriptionKey: 'companies.dialog.hints.faceToPersonUpperBodyMaxYRatio',
  },
  employeeLockStrict: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.employeeLockStrict',
  },
  observationIntervalSeconds: {
    min: 0.2,
    max: 10,
    recommended: 2,
    descriptionKey: 'companies.dialog.hints.observationIntervalSeconds',
  },
  inThresholdSeconds: {
    min: 0,
    max: 60,
    recommended: 1.5,
    descriptionKey: 'companies.dialog.hints.inThresholdSeconds',
  },
  outThresholdSeconds: {
    min: 0,
    max: 300,
    recommended: 12,
    descriptionKey: 'companies.dialog.hints.outThresholdSeconds',
  },
  personDetIntervalFrames: {
    min: 1,
    max: 120,
    recommended: 8,
    descriptionKey: 'companies.dialog.hints.personDetIntervalFrames',
  },
  personDetOnNewFace: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.personDetOnNewFace',
  },
  streamFps: {
    min: 1,
    max: 30,
    recommended: 12,
    descriptionKey: 'companies.dialog.hints.streamFps',
  },
  streamJpegQuality: {
    min: 30,
    max: 95,
    recommended: 80,
    descriptionKey: 'companies.dialog.hints.streamJpegQuality',
  },
  actionStartThreshold: {
    min: 0,
    max: 1,
    recommended: 0.68,
    descriptionKey: 'companies.dialog.hints.actionStartThreshold',
  },
  actionEndThreshold: {
    min: 0,
    max: 1,
    recommended: 0.42,
    descriptionKey: 'companies.dialog.hints.actionEndThreshold',
  },
  actionGapSeconds: {
    min: 0.1,
    max: 30,
    recommended: 2,
    descriptionKey: 'companies.dialog.hints.actionGapSeconds',
  },
  actionMinDurationSeconds: {
    min: 0,
    max: 60,
    recommended: 1.5,
    descriptionKey: 'companies.dialog.hints.actionMinDurationSeconds',
  },
  actionMaxIntervalSeconds: {
    min: 0,
    max: 3600,
    recommended: 0,
    descriptionKey: 'companies.dialog.hints.actionMaxIntervalSeconds',
  },
  actionFps: {
    min: 1,
    max: 30,
    recommended: 8,
    descriptionKey: 'companies.dialog.hints.actionFps',
  },
  actionMaxFrames: {
    min: 16,
    max: 512,
    recommended: 64,
    descriptionKey: 'companies.dialog.hints.actionMaxFrames',
  },
  actionDebug: {
    recommended: false,
    descriptionKey: 'companies.dialog.hints.actionDebug',
  },
  drawFaceBoxes: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.drawFaceBoxes',
  },
  drawPersonBoxes: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.drawPersonBoxes',
  },
  drawNames: {
    recommended: true,
    descriptionKey: 'companies.dialog.hints.drawNames',
  },
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function formatMetaValue(value: MetaValue): string {
  if (typeof value === 'boolean') {
    return t(value ? 'companies.dialog.meta.enabled' : 'companies.dialog.meta.disabled')
  }

  if (typeof value === 'number') {
    return formatNumber(value)
  }

  if (value === 'on_demand') {
    return t('companies.dialog.personDetectionOnDemand')
  }

  return t('companies.dialog.always')
}

function hintText(key: string): string {
  const meta = fieldMeta[key]
  if (!meta) {
    return ''
  }

  const parts: string[] = []

  if (meta.options?.length) {
    parts.push(
      t('companies.dialog.meta.options', {
        value: meta.options.map((option) => formatMetaValue(option)).join(' / '),
      })
    )
  }

  if (meta.min !== undefined) {
    parts.push(t('companies.dialog.meta.min', { value: formatNumber(meta.min) }))
  }

  if (meta.max !== undefined) {
    parts.push(t('companies.dialog.meta.max', { value: formatNumber(meta.max) }))
  }

  parts.push(
    t('companies.dialog.meta.recommended', {
      value: formatMetaValue(meta.recommended),
    })
  )
  parts.push(t(meta.descriptionKey))

  return parts.join(' · ')
}

function toggleAdvanced() {
  emit('update:showAdvanced', !props.showAdvanced)
}
</script>

<template>
  <el-divider v-if="withDivider" content-position="left">
    {{ t('companies.dialog.recognitionSettings') }}
  </el-divider>

  <el-form-item :label="t('companies.dialog.peopleTracking')">
    <el-switch v-model="config.personTracking.enabled" />
    <template #extra>
      <span class="field-hint">{{ hintText('peopleTracking') }}</span>
    </template>
  </el-form-item>

  <el-form-item :label="t('companies.dialog.observationMode')">
    <el-switch v-model="config.presence.observationMode" />
    <template #extra>
      <span class="field-hint">{{ hintText('observationMode') }}</span>
    </template>
  </el-form-item>

  <el-form-item :label="t('companies.dialog.personDetectionMode')">
    <el-select v-model="config.optimization.personDetectMode">
      <el-option :label="t('companies.dialog.personDetectionOnDemand')" value="on_demand" />
      <el-option :label="t('companies.dialog.always')" value="always" />
    </el-select>
    <template #extra>
      <span class="field-hint">{{ hintText('personDetectionMode') }}</span>
    </template>
  </el-form-item>

  <el-link type="primary" @click="toggleAdvanced" style="margin-bottom: 16px">
    {{ showAdvanced ? t('companies.dialog.hideAdvanced') : t('companies.dialog.showAdvanced') }}
  </el-link>

  <div v-show="showAdvanced">
    <el-collapse>
      <el-collapse-item :title="t('companies.dialog.section.quality')" name="quality">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.minFaceHeight')">
            <el-input-number v-model="config.quality.minFaceHeight" :min="10" :max="200" />
            <template #extra>
              <span class="field-hint">{{ hintText('minFaceHeight') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.minBlur')">
            <el-input-number v-model="config.quality.minBlurVar" :min="0" :max="500" :step="10" />
            <template #extra>
              <span class="field-hint">{{ hintText('minBlur') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.recognition')" name="insightface">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.similarityThreshold')">
            <el-input-number v-model="config.insightface.threshold" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('similarityThreshold') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.minMargin')">
            <el-input-number v-model="config.insightface.minMargin" :min="0" :max="1" :step="0.01" />
            <template #extra>
              <span class="field-hint">{{ hintText('minMargin') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceExtra')">
            <el-input-number v-model="config.insightface.lowConfidenceExtra" :min="0" :max="1" :step="0.01" />
            <template #extra>
              <span class="field-hint">{{ hintText('lowConfidenceExtra') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceMinMargin')">
            <el-input-number v-model="config.insightface.lowConfidenceMinMargin" :min="0" :max="1" :step="0.01" />
            <template #extra>
              <span class="field-hint">{{ hintText('lowConfidenceMinMargin') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.faceTracking')" name="faceTracking">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.minEmbeddings')">
            <el-input-number v-model="config.faceTracking.minEmbeddings" :min="1" :max="10" />
            <template #extra>
              <span class="field-hint">{{ hintText('minEmbeddings') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceExtraEmbeddings')">
            <el-input-number v-model="config.faceTracking.lowConfidenceExtraEmbeddings" :min="0" :max="10" />
            <template #extra>
              <span class="field-hint">{{ hintText('lowConfidenceExtraEmbeddings') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceTrackMaxAgeSeconds')">
            <el-input-number v-model="config.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
            <template #extra>
              <span class="field-hint">{{ hintText('faceTrackMaxAgeSeconds') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.personTracking')" name="personTracking">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.personDetectorConfidence')">
            <el-input-number v-model="config.personTracking.detConf" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('personDetectorConfidence') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personIouThreshold')">
            <el-input-number v-model="config.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('personIouThreshold') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personTrackMaxAgeSeconds')">
            <el-input-number v-model="config.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
            <template #extra>
              <span class="field-hint">{{ hintText('personTrackMaxAgeSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonIouThreshold')">
            <el-input-number v-model="config.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('faceToPersonIouThreshold') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonContainmentMin')">
            <el-input-number v-model="config.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('faceToPersonContainmentMin') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonLooseContainmentMin')">
            <el-input-number v-model="config.personTracking.faceToPersonLooseContainmentMin" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('faceToPersonLooseContainmentMin') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonUpperBodyMaxYRatio')">
            <el-input-number v-model="config.personTracking.faceToPersonUpperBodyMaxYRatio" :min="0" :max="1" :step="0.05" />
            <template #extra>
              <span class="field-hint">{{ hintText('faceToPersonUpperBodyMaxYRatio') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.employeeLockStrict')">
            <el-switch v-model="config.personTracking.employeeLockStrict" />
            <template #extra>
              <span class="field-hint">{{ hintText('employeeLockStrict') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.presence')" name="presence">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.observationIntervalSeconds')">
            <el-input-number v-model="config.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
            <template #extra>
              <span class="field-hint">{{ hintText('observationIntervalSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.inThresholdSeconds')">
            <el-input-number v-model="config.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
            <template #extra>
              <span class="field-hint">{{ hintText('inThresholdSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.outThresholdSeconds')">
            <el-input-number v-model="config.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
            <template #extra>
              <span class="field-hint">{{ hintText('outThresholdSeconds') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.optimization')" name="optimization">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.personDetIntervalFrames')">
            <el-input-number v-model="config.optimization.personDetIntervalFrames" :min="1" :max="120" />
            <template #extra>
              <span class="field-hint">{{ hintText('personDetIntervalFrames') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personDetOnNewFace')">
            <el-switch v-model="config.optimization.personDetOnNewFace" />
            <template #extra>
              <span class="field-hint">{{ hintText('personDetOnNewFace') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.streaming')" name="streaming">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.streamFps')">
            <el-input-number v-model="config.streaming.streamFps" :min="1" :max="30" />
            <template #extra>
              <span class="field-hint">{{ hintText('streamFps') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.streamJpegQuality')">
            <el-input-number v-model="config.streaming.streamJpegQuality" :min="30" :max="95" />
            <template #extra>
              <span class="field-hint">{{ hintText('streamJpegQuality') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.actionRecognition')" name="actionRecognition">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.actionStartThreshold')">
            <el-input-number v-model="config.actionRecognition.startThreshold" :min="0" :max="1" :step="0.01" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionStartThreshold') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionEndThreshold')">
            <el-input-number v-model="config.actionRecognition.endThreshold" :min="0" :max="1" :step="0.01" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionEndThreshold') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionGapSeconds')">
            <el-input-number v-model="config.actionRecognition.gapSeconds" :min="0.1" :max="30" :step="0.1" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionGapSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMinDurationSeconds')">
            <el-input-number v-model="config.actionRecognition.minDurationSeconds" :min="0" :max="60" :step="0.1" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionMinDurationSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMaxIntervalSeconds')">
            <el-input-number v-model="config.actionRecognition.maxIntervalSeconds" :min="0" :max="3600" :step="1" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionMaxIntervalSeconds') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionFps')">
            <el-input-number v-model="config.actionRecognition.fps" :min="1" :max="30" :step="1" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionFps') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMaxFrames')">
            <el-input-number v-model="config.actionRecognition.maxFrames" :min="16" :max="512" :step="1" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionMaxFrames') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionDebug')">
            <el-switch v-model="config.actionRecognition.debug" />
            <template #extra>
              <span class="field-hint">{{ hintText('actionDebug') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.visualization')" name="visualization">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.drawFaceBoxes')">
            <el-switch v-model="config.visualization.drawFaceBoxes" />
            <template #extra>
              <span class="field-hint">{{ hintText('drawFaceBoxes') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.drawPersonBoxes')">
            <el-switch v-model="config.visualization.drawPersonBoxes" />
            <template #extra>
              <span class="field-hint">{{ hintText('drawPersonBoxes') }}</span>
            </template>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.drawNames')">
            <el-switch v-model="config.visualization.drawNames" />
            <template #extra>
              <span class="field-hint">{{ hintText('drawNames') }}</span>
            </template>
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.field-hint {
  display: inline-block;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
}
</style>
