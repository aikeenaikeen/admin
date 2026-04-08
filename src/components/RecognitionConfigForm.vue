<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  RECOGNITION_FIELD_META,
  type MetaValue,
} from '@/constants/recognitionConfig'

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
  const meta = RECOGNITION_FIELD_META[key]
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
    <div class="field-hint">{{ hintText('peopleTracking') }}</div>
  </el-form-item>

  <el-form-item :label="t('companies.dialog.observationMode')">
    <el-switch v-model="config.presence.observationMode" />
    <div class="field-hint">{{ hintText('observationMode') }}</div>
  </el-form-item>

  <el-form-item :label="t('companies.dialog.personDetectionMode')">
    <el-select v-model="config.optimization.personDetectMode">
      <el-option :label="t('companies.dialog.personDetectionOnDemand')" value="on_demand" />
      <el-option :label="t('companies.dialog.always')" value="always" />
    </el-select>
    <div class="field-hint">{{ hintText('personDetectionMode') }}</div>
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
            <div class="field-hint">{{ hintText('minFaceHeight') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.minBlur')">
            <el-input-number v-model="config.quality.minBlurVar" :min="0" :max="500" :step="10" />
            <div class="field-hint">{{ hintText('minBlur') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.recognition')" name="insightface">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.similarityThreshold')">
            <el-input-number v-model="config.insightface.threshold" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('similarityThreshold') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.minMargin')">
            <el-input-number v-model="config.insightface.minMargin" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('minMargin') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceExtra')">
            <el-input-number v-model="config.insightface.lowConfidenceExtra" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('lowConfidenceExtra') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceMinMargin')">
            <el-input-number v-model="config.insightface.lowConfidenceMinMargin" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('lowConfidenceMinMargin') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.faceTracking')" name="faceTracking">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.minEmbeddings')">
            <el-input-number v-model="config.faceTracking.minEmbeddings" :min="1" :max="10" />
            <div class="field-hint">{{ hintText('minEmbeddings') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.lowConfidenceExtraEmbeddings')">
            <el-input-number v-model="config.faceTracking.lowConfidenceExtraEmbeddings" :min="0" :max="10" />
            <div class="field-hint">{{ hintText('lowConfidenceExtraEmbeddings') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceTrackMaxAgeSeconds')">
            <el-input-number v-model="config.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
            <div class="field-hint">{{ hintText('faceTrackMaxAgeSeconds') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.personTracking')" name="personTracking">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.personDetectorConfidence')">
            <el-input-number v-model="config.personTracking.detConf" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('personDetectorConfidence') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personIouThreshold')">
            <el-input-number v-model="config.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('personIouThreshold') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personTrackMaxAgeSeconds')">
            <el-input-number v-model="config.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
            <div class="field-hint">{{ hintText('personTrackMaxAgeSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personAssignmentTtlSeconds')">
            <el-input-number v-model="config.personTracking.personAssignmentTtlSeconds" :min="0.5" :max="30" :step="0.5" />
            <div class="field-hint">{{ hintText('personAssignmentTtlSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonIouThreshold')">
            <el-input-number v-model="config.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('faceToPersonIouThreshold') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonContainmentMin')">
            <el-input-number v-model="config.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('faceToPersonContainmentMin') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonLooseContainmentMin')">
            <el-input-number v-model="config.personTracking.faceToPersonLooseContainmentMin" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('faceToPersonLooseContainmentMin') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.faceToPersonUpperBodyMaxYRatio')">
            <el-input-number v-model="config.personTracking.faceToPersonUpperBodyMaxYRatio" :min="0" :max="1" :step="0.05" />
            <div class="field-hint">{{ hintText('faceToPersonUpperBodyMaxYRatio') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.employeeLockStrict')">
            <el-switch v-model="config.personTracking.employeeLockStrict" />
            <div class="field-hint">{{ hintText('employeeLockStrict') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.presence')" name="presence">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.observationIntervalSeconds')">
            <el-input-number v-model="config.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
            <div class="field-hint">{{ hintText('observationIntervalSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.inThresholdSeconds')">
            <el-input-number v-model="config.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
            <div class="field-hint">{{ hintText('inThresholdSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.outThresholdSeconds')">
            <el-input-number v-model="config.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
            <div class="field-hint">{{ hintText('outThresholdSeconds') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.optimization')" name="optimization">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.personDetIntervalFrames')">
            <el-input-number v-model="config.optimization.personDetIntervalFrames" :min="1" :max="120" />
            <div class="field-hint">{{ hintText('personDetIntervalFrames') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.personDetOnNewFace')">
            <el-switch v-model="config.optimization.personDetOnNewFace" />
            <div class="field-hint">{{ hintText('personDetOnNewFace') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.streaming')" name="streaming">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.streamFps')">
            <el-input-number v-model="config.streaming.streamFps" :min="1" :max="30" />
            <div class="field-hint">{{ hintText('streamFps') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.streamJpegQuality')">
            <el-input-number v-model="config.streaming.streamJpegQuality" :min="30" :max="95" />
            <div class="field-hint">{{ hintText('streamJpegQuality') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.actionRecognition')" name="actionRecognition">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.actionStartThreshold')">
            <el-input-number v-model="config.actionRecognition.startThreshold" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('actionStartThreshold') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionEndThreshold')">
            <el-input-number v-model="config.actionRecognition.endThreshold" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('actionEndThreshold') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionConflictWinnerMargin')">
            <el-input-number v-model="config.actionRecognition.conflictWinnerMargin" :min="0" :max="1" :step="0.01" />
            <div class="field-hint">{{ hintText('actionConflictWinnerMargin') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionGapSeconds')">
            <el-input-number v-model="config.actionRecognition.gapSeconds" :min="0.1" :max="30" :step="0.1" />
            <div class="field-hint">{{ hintText('actionGapSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMinDurationSeconds')">
            <el-input-number v-model="config.actionRecognition.minDurationSeconds" :min="0" :max="60" :step="0.1" />
            <div class="field-hint">{{ hintText('actionMinDurationSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMaxIntervalSeconds')">
            <el-input-number v-model="config.actionRecognition.maxIntervalSeconds" :min="0" :max="3600" :step="1" />
            <div class="field-hint">{{ hintText('actionMaxIntervalSeconds') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionFps')">
            <el-input-number v-model="config.actionRecognition.fps" :min="1" :max="30" :step="1" />
            <div class="field-hint">{{ hintText('actionFps') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionMaxFrames')">
            <el-input-number v-model="config.actionRecognition.maxFrames" :min="16" :max="512" :step="1" />
            <div class="field-hint">{{ hintText('actionMaxFrames') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.actionDebug')">
            <el-switch v-model="config.actionRecognition.debug" />
            <div class="field-hint">{{ hintText('actionDebug') }}</div>
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item :title="t('companies.dialog.section.visualization')" name="visualization">
        <el-form label-width="280px">
          <el-form-item :label="t('companies.dialog.fields.drawFaceBoxes')">
            <el-switch v-model="config.visualization.drawFaceBoxes" />
            <div class="field-hint">{{ hintText('drawFaceBoxes') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.drawPersonBoxes')">
            <el-switch v-model="config.visualization.drawPersonBoxes" />
            <div class="field-hint">{{ hintText('drawPersonBoxes') }}</div>
          </el-form-item>
          <el-form-item :label="t('companies.dialog.fields.drawNames')">
            <el-switch v-model="config.visualization.drawNames" />
            <div class="field-hint">{{ hintText('drawNames') }}</div>
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
