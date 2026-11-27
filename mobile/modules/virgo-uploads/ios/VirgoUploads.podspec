Pod::Spec.new do |s|
  s.name           = 'VirgoUploads'
  s.version        = '1.0.0'
  s.summary        = 'Sends uploads in a background URL session that outlives the app.'
  s.description    = 'Hands a whole batch to iOS, which carries on with Virgo suspended or ended, and wakes it when done (docs/BACKGROUND_UPLOADS.md).'
  s.license        = 'UNLICENSED'
  s.author         = 'Virgo'
  s.homepage       = 'https://virgo.ph'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
