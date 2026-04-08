export type RecognitionConfig = Record<string, any>

export type MetaValue = number | boolean | 'on_demand' | 'always'

export interface FieldMeta {
  min?: number
  max?: number
  recommended: MetaValue
  options?: MetaValue[]
  descriptionKey: string
}

export const RECOMMENDED_RECOGNITION_CONFIG: RecognitionConfig = {
  quality: {
    minFaceHeight: 24,
    minBlurVar: 45,
  },
  insightface: {
    threshold: 0.2,
    minMargin: 0.03,
    lowConfidenceExtra: 0.08,
    lowConfidenceMinMargin: 0.06,
  },
  faceTracking: {
    minEmbeddings: 3,
    lowConfidenceExtraEmbeddings: 2,
    trackMaxAgeSeconds: 2.5,
  },
  personTracking: {
    enabled: true,
    detConf: 0.45,
    iouThreshold: 0.3,
    trackMaxAgeSeconds: 6,
    personAssignmentTtlSeconds: 2.5,
    faceToPersonIouThreshold: 0.02,
    faceToPersonContainmentMin: 0.45,
    faceToPersonLooseContainmentMin: 0.25,
    faceToPersonUpperBodyMaxYRatio: 0.72,
    employeeLockStrict: true,
  },
  optimization: {
    personDetectMode: 'on_demand',
    personDetIntervalFrames: 8,
    personDetOnNewFace: true,
  },
  presence: {
    observationMode: true,
    observationIntervalSeconds: 2,
    inThresholdSeconds: 1.5,
    outThresholdSeconds: 12,
  },
  streaming: {
    streamFps: 12,
    streamJpegQuality: 80,
  },
  visualization: {
    drawFaceBoxes: true,
    drawPersonBoxes: true,
    drawNames: true,
  },
  actionRecognition: {
    startThreshold: 0.68,
    endThreshold: 0.42,
    conflictWinnerMargin: 0.08,
    gapSeconds: 2,
    minDurationSeconds: 1.5,
    maxIntervalSeconds: 0,
    fps: 8,
    maxFrames: 64,
    debug: false,
  },
}

export const RECOGNITION_FIELD_META: Readonly<Record<string, FieldMeta>> = {
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
  personAssignmentTtlSeconds: {
    min: 0.5,
    max: 30,
    recommended: 2.5,
    descriptionKey: 'companies.dialog.hints.personAssignmentTtlSeconds',
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
  actionConflictWinnerMargin: {
    min: 0,
    max: 1,
    recommended: 0.08,
    descriptionKey: 'companies.dialog.hints.actionConflictWinnerMargin',
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
